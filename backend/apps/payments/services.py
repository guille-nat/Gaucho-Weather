"""Subscribing, the webhook and cancelling (pagos-backoffice S3).

A plan only changes through `plans.change_plan`: "payment" when the provider authorizes a
subscription, "payment_ended" when a cancelled one's paid month is over (back to Básico, or to
Productor for a founder). A rejected charge never downgrades: Mercado Pago retries it and
cancels the subscription if it keeps failing. A checkout that becomes authorized sends one
confirmation email with the terms (promociones S0e).
"""

from __future__ import annotations

import logging
from datetime import datetime
from functools import partial

from django.conf import settings
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts import plans
from apps.accounts.models import Plan, PlanChange, User

from .models import Payment, ProviderSubscription
from .providers import get_provider, provider_for_currency
from .providers.base import (
    PaymentProvider,
    ProviderError,
    RemotePayment,
    RemoteSubscription,
    WebhookEvent,
)

logger = logging.getLogger(__name__)

USD_UNAVAILABLE = "Pagar en dólares todavía no está disponible."
NOT_ENABLED = "Los pagos todavía no están habilitados."
BASICO_IS_FREE = "El plan Básico es gratis: no hace falta suscribirse."
FOUNDER_IS_FREE = "Como founder ya tenés Productor gratis para siempre."
ALREADY_SUBSCRIBED = "Ya tenés una suscripción activa. Date de baja antes de cambiar de plan."
NO_ARS_PRICE = "Ese plan todavía no tiene precio en pesos."
PROVIDER_DOWN = "No pudimos conectar con Mercado Pago. Probá de nuevo en un rato."
NO_SUBSCRIPTION = "No tenés una suscripción con Mercado Pago."

S = ProviderSubscription.Status
RUNNING = (S.AUTHORIZED, S.PAUSED)  # the account has (or keeps) the paid plan
# Charges stopped: the plan is kept until the paid month is over (S8 treats paused as cancelled).
STOPPED = (S.CANCELLED, S.PAUSED)


class PaymentRefusal(Exception):
    """A request the user cannot make; `detail` is shown as is with `status`."""

    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def back_url() -> str:
    """Where Mercado Pago sends the payer after the checkout (the SPA shows a notice)."""
    return f"{settings.PUBLIC_APP_URL}/perfil/suscripcion?pago=ok"


def _ending(user: User):
    """Cancelled subscriptions still inside their paid month."""
    return user.provider_subscriptions.filter(status=S.CANCELLED, ended_at=None)


def ars_prices() -> dict[str, int | None]:
    """Every plan's monthly peso price, by code."""
    return dict(Plan.objects.values_list("code", "price_ars_month"))


def founder_empresa_price(prices: dict[str, int | None] | None = None) -> int | None:
    """What a founder pays a month for Empresa: the difference with Productor (SF1).

    A founder already has Productor for free, so only the rest is charged. None when a price
    is missing or the difference is not positive. `prices` (by plan code) prices it with other
    prices than today's, for a scheduled change (avisos-cambios S2).
    """
    if prices is None:
        prices = ars_prices()
    empresa, productor = prices.get(Plan.EMPRESA), prices.get(Plan.PRODUCTOR)
    if empresa is None or productor is None:
        return None
    difference = empresa - productor
    return difference if difference > 0 else None


def price_for(user: User, plan: Plan, prices: dict[str, int | None] | None = None) -> int | None:
    """The monthly peso amount `user` pays for `plan`; None when it cannot be charged.

    The one place that prices a subscription: the preapproval, its ProviderSubscription, the
    pending-checkout reuse check and a scheduled price change all use it. `prices` (by plan
    code) replaces today's prices.
    """
    if user.is_founder:
        return founder_empresa_price(prices) if plan.code == Plan.EMPRESA else None
    price = plan.price_ars_month if prices is None else prices.get(plan.code)
    return price or None


def subscribe(user: User, plan_code: str, currency: str) -> ProviderSubscription:
    provider = provider_for_currency(currency)
    if provider is None:
        raise PaymentRefusal(409, USD_UNAVAILABLE)
    if not provider.is_configured():
        raise PaymentRefusal(503, NOT_ENABLED)
    plan = Plan.objects.filter(code=plan_code).first()
    if plan is None:
        raise PaymentRefusal(400, plans.NO_SUCH_PLAN)
    if plan.code == Plan.BASICO:
        raise PaymentRefusal(400, BASICO_IS_FREE)
    user = User.objects.get(pk=user.pk)
    # A founder has Productor free for good and pays only to move up to Empresa (SF1).
    if user.is_founder and plan.code != Plan.EMPRESA:
        raise PaymentRefusal(400, FOUNDER_IS_FREE)
    if user.provider_subscriptions.filter(status__in=RUNNING, ended_at=None).exists():
        raise PaymentRefusal(400, ALREADY_SUBSCRIBED)
    on_trial = plans.membership_status(user) == "trial"
    if user.plan_id == plan.code and not on_trial and not _ending(user).exists():
        raise PaymentRefusal(400, plans.ALREADY_ON_PLAN.format(name=plan.name))
    amount = price_for(user, plan)
    if amount is None:
        raise PaymentRefusal(409, NO_ARS_PRICE)
    with transaction.atomic():
        # One checkout per account at a time: a double click or a plan switch must never
        # leave two preapprovals the payer could authorize (two monthly charges).
        User.objects.select_for_update().get(pk=user.pk)
        open_checkouts = user.provider_subscriptions.select_for_update().filter(
            status=S.PENDING, ended_at=None
        )
        reusable = open_checkouts.filter(plan=plan, currency=currency, amount=amount).first()
        if reusable is not None:
            return reusable
        # A paused subscription that already ran out its month could still be resumed at
        # Mercado Pago and charge again next to the new one: cancel it as well.
        stale = list(open_checkouts) + list(
            user.provider_subscriptions.select_for_update()
            .filter(status=S.PAUSED)
            .exclude(ended_at=None)
        )
        # A remote cancel cannot be rolled back, so a failure after it must not roll back
        # its local record either: keep the refusal, let the block commit, then raise it.
        try:
            for old in stale:
                _drop_checkout(provider, old)
            return _start(provider, user, plan, currency, amount)
        except PaymentRefusal as exc:
            refusal = exc
    raise refusal


def _drop_checkout(provider: PaymentProvider, sub: ProviderSubscription) -> None:
    """Cancel a checkout that was never paid; if Mercado Pago cannot, refuse the new one."""
    try:
        provider.cancel_subscription(sub.external_id)
    except ProviderError as exc:
        raise PaymentRefusal(502, PROVIDER_DOWN) from exc
    sub.status = S.CANCELLED
    sub.ended_at = timezone.now()
    sub.save(update_fields=["status", "ended_at", "updated_at"])


def _start(
    provider: PaymentProvider, user: User, plan: Plan, currency: str, amount: int
) -> ProviderSubscription:
    try:
        checkout = provider.start_subscription(
            payer_email=user.email,
            reason=f"Gaucho Weather · plan {plan.name}",
            amount=amount,
            currency=currency,
            reference=f"gw-user-{user.pk}-{plan.code}",
            back_url=back_url(),
        )
    except ProviderError as exc:
        raise PaymentRefusal(502, PROVIDER_DOWN) from exc
    return ProviderSubscription.objects.create(
        user=user,
        plan=plan,
        provider=provider.name,
        currency=currency,
        amount=amount,
        external_id=checkout.external_id,
        status=S.PENDING,
        checkout_url=checkout.checkout_url,
    )


def handle_event(provider: PaymentProvider, event: WebhookEvent) -> None:
    """Fetch what the notification points at and apply it. Raises ProviderError."""
    if event.kind == WebhookEvent.SUBSCRIPTION:
        sync_subscription(provider.name, provider.fetch_subscription(event.resource_id))
    elif event.kind == WebhookEvent.PAYMENT:
        record_payment(provider.name, provider.fetch_payment(event.resource_id))
    elif event.kind == WebhookEvent.INVOICE:
        payment_id, subscription_id = provider.fetch_invoice(event.resource_id)
        if payment_id:
            record_payment(provider.name, provider.fetch_payment(payment_id), subscription_id)


def sync_subscription(
    provider_name: str, remote: RemoteSubscription, now: datetime | None = None
) -> ProviderSubscription | None:
    """Mirror the provider's state and apply its plan rule. Idempotent."""
    now = now or timezone.now()
    with transaction.atomic():
        sub = (
            ProviderSubscription.objects.select_for_update()
            .filter(provider=provider_name, external_id=remote.external_id)
            .first()
        )
        if sub is None:
            logger.info("Ignoring unknown %s subscription %s", provider_name, remote.external_id)
            return None
        previous = sub.status
        sub.status = remote.status
        if remote.next_payment_at is not None:
            sub.next_payment_at = remote.next_payment_at
        sub.save(update_fields=["status", "next_payment_at", "updated_at"])
        if sub.ended_at is not None:
            if not (previous == S.PAUSED and sub.status == S.AUTHORIZED):
                return sub  # finished already: a late notification changes nothing
            sub.ended_at = None  # a paused subscription was resumed: it runs again
            sub.save(update_fields=["ended_at", "updated_at"])
        if sub.status == S.AUTHORIZED:
            plans.change_plan(sub.user, sub.plan_id, PlanChange.Reason.PAYMENT)
            # A new subscription replaces one still running out its paid month.
            _ending(sub.user).exclude(pk=sub.pk).update(ended_at=now)
            # Only the checkout's first authorization: a repeated notification or a resume after
            # a pause never emails again, and neither does one authorized before the email.
            if previous == S.PENDING and sub.confirmation_sent_at is None:
                sub.confirmation_sent_at = now
                sub.save(update_fields=["confirmation_sent_at", "updated_at"])
                transaction.on_commit(partial(_send_confirmation, sub.pk))
        elif sub.status in STOPPED:
            if previous == S.PENDING:
                sub.ended_at = now  # never paid: there is no plan to take back
                sub.save(update_fields=["ended_at", "updated_at"])
            elif sub.next_payment_at is None or sub.next_payment_at <= now:
                _end(sub, now)
    return sub


CONFIRMATION_SUBJECT = "Tu suscripción a Gaucho Weather está activa"
CONFIRMATION_BODY = (
    "Hola {name}:\n\n"
    "Tu suscripción al plan {plan} quedó activa.\n\n"
    "- Pagás {amount} por mes, en pesos, con Mercado Pago.{founder}\n"
    "- Se renueva sola todos los meses hasta que te des de baja.\n"
    "- Para darte de baja, entrá a {url}/perfil/suscripcion y tocá «Darme de baja». Seguís con "
    "el plan hasta el final del mes que ya pagaste y no te cobramos más.\n\n"
    "Términos y condiciones: {url}/terminos\n"
    "Política de privacidad: {url}/privacidad\n"
    "Reglas del programa: {url}/reglas\n\n"
    "Gaucho Weather"
)
CONFIRMATION_FOUNDER = (
    "\n- Como founder pagás solo la diferencia con Productor, que seguís teniendo gratis."
)


def pesos(amount: int) -> str:
    """Pesos grouped like the SPA's formatMoney: "$ 14.900"."""
    return f"$ {amount:,}".replace(",", ".")


def _send_confirmation(sub_pk: int) -> None:
    """The confirmation email of a subscription that became authorized (S0e)."""
    try:
        sub = ProviderSubscription.objects.select_related("user", "plan").get(pk=sub_pk)
        body = CONFIRMATION_BODY.format(
            name=sub.user.name,
            plan=sub.plan.name,
            amount=pesos(sub.amount),
            founder=CONFIRMATION_FOUNDER if sub.user.is_founder else "",
            url=settings.PUBLIC_APP_URL,
        )
        send_mail(CONFIRMATION_SUBJECT, body, None, [sub.user.email])
    except Exception:  # the plan already changed; a lost email must not undo it
        logger.exception("Could not send the subscription confirmation for %s", sub_pk)


def _end(sub: ProviderSubscription, now: datetime) -> None:
    """The paid month of a locked, cancelled subscription is over: back to the free plan.

    That is Básico, or Productor for a founder, who keeps it free for good (SF3).
    """
    user = User.objects.get(pk=sub.user_id)
    replaced = (
        user.provider_subscriptions.exclude(pk=sub.pk)
        .filter(status__in=RUNNING, ended_at=None)
        .exists()
    )
    if not replaced and user.plan_id == sub.plan_id:
        free_plan = Plan.PRODUCTOR if user.is_founder else Plan.BASICO
        plans.change_plan(user, free_plan, PlanChange.Reason.PAYMENT_ENDED)
    sub.ended_at = now
    sub.save(update_fields=["ended_at", "updated_at"])


def end_cancelled_subscriptions(now: datetime | None = None) -> int:
    """Move every cancelled or paused subscription whose paid month is over to the free plan.

    Idempotent.

    Trials expire on their own task (`accounts.expire_trials`), which only handles trials.
    """
    now = now or timezone.now()
    due = ProviderSubscription.objects.filter(
        status__in=STOPPED, ended_at=None, next_payment_at__lte=now
    ).values_list("pk", flat=True)
    ended = 0
    for pk in due:
        with transaction.atomic():
            sub = ProviderSubscription.objects.select_for_update().get(pk=pk)
            if sub.status not in STOPPED or sub.ended_at is not None:
                continue  # authorized again or ended meanwhile
            _end(sub, now)
        ended += 1
    return ended


def record_payment(
    provider_name: str, remote: RemotePayment, subscription_id: str | None = None
) -> Payment | None:
    """Create or update the Payment by the provider's id. Never changes the plan."""
    external_sub = remote.subscription_external_id or subscription_id
    sub = (
        ProviderSubscription.objects.filter(provider=provider_name, external_id=external_sub)
        .select_related("user")
        .first()
        if external_sub
        else None
    )
    if sub is None:
        logger.info(
            "Ignoring %s payment %s of no known subscription", provider_name, remote.external_id
        )
        return None
    fields = {
        "user": sub.user,
        "subscription": sub,
        "provider": provider_name,
        "amount": remote.amount,
        "currency": remote.currency,
        "status": remote.status,
        "paid_at": remote.paid_at,
        "payload": remote.payload,
    }
    try:
        with transaction.atomic():
            payment, _ = Payment.objects.update_or_create(
                external_id=remote.external_id, defaults=fields
            )
    except IntegrityError:  # the same payment notified twice at once
        Payment.objects.filter(external_id=remote.external_id).update(**fields)
        payment = Payment.objects.get(external_id=remote.external_id)
    return payment


def fetch_subscription_state(
    provider: PaymentProvider, sub: ProviderSubscription
) -> tuple[RemoteSubscription, list[RemotePayment]]:
    """Read a subscription and its charges from the provider, without saving anything.

    For the backoffice's sync (backoffice-superadmin S4): every call happens before the caller
    applies the answer, so a failure halfway leaves the local rows as they were. Raises
    ProviderError.
    """
    remote = provider.fetch_subscription(sub.external_id)
    payment_ids = provider.subscription_payment_ids(sub.external_id)
    return remote, [provider.fetch_payment(payment_id) for payment_id in payment_ids]


def current_subscription(user: User) -> ProviderSubscription | None:
    """The subscription the page shows: running, or cancelled but still in its paid month."""
    return (
        user.provider_subscriptions.exclude(status=S.PENDING)
        .filter(ended_at=None)
        .select_related("plan")
        .first()
    )


def cancel_before_deleting(user: User) -> None:
    """Cancel at the provider every subscription that could still charge, before the account
    is deleted: a pending checkout, an authorized one and a paused one (it can be resumed).

    If the provider cannot cancel one, it is read back: already cancelled there (a missed
    webhook) counts as done. Otherwise raise PaymentRefusal(502) and the caller keeps the
    account: deleting it would leave a subscription charging an account that no longer exists.
    """
    for sub in user.provider_subscriptions.exclude(status=S.CANCELLED):
        provider = get_provider(sub.provider)
        try:
            remote = provider.cancel_subscription(sub.external_id)
        except ProviderError as exc:
            remote = _already_cancelled(provider, sub)
            if remote is None:
                raise PaymentRefusal(502, PROVIDER_DOWN) from exc
        sync_subscription(sub.provider, remote)


def _already_cancelled(
    provider: PaymentProvider, sub: ProviderSubscription
) -> RemoteSubscription | None:
    try:
        remote = provider.fetch_subscription(sub.external_id)
    except ProviderError:
        return None
    return remote if remote.status == S.CANCELLED else None


def cancel(user: User) -> ProviderSubscription:
    sub = user.provider_subscriptions.filter(status__in=RUNNING, ended_at=None).first()
    if sub is None:
        raise PaymentRefusal(404, NO_SUBSCRIPTION)
    try:
        remote = get_provider(sub.provider).cancel_subscription(sub.external_id)
    except ProviderError as exc:
        raise PaymentRefusal(502, PROVIDER_DOWN) from exc
    return sync_subscription(sub.provider, remote) or sub
