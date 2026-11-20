"""Subscribing, the webhook and cancelling (pagos-backoffice S3).

A plan only changes through `plans.change_plan`: "payment" when the provider authorizes a
subscription, "payment_ended" when a cancelled one's paid month is over. A rejected charge
never downgrades: Mercado Pago retries it and cancels the subscription if it keeps failing.
"""

from __future__ import annotations

import logging
from datetime import datetime

from django.conf import settings
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
    if user.is_founder:
        raise PaymentRefusal(400, FOUNDER_IS_FREE)
    if user.provider_subscriptions.filter(status__in=RUNNING, ended_at=None).exists():
        raise PaymentRefusal(400, ALREADY_SUBSCRIBED)
    on_trial = plans.membership_status(user) == "trial"
    if user.plan_id == plan.code and not on_trial and not _ending(user).exists():
        raise PaymentRefusal(400, plans.ALREADY_ON_PLAN.format(name=plan.name))
    if not plan.price_ars_month:
        raise PaymentRefusal(409, NO_ARS_PRICE)
    with transaction.atomic():
        # One checkout per account at a time: a double click or a plan switch must never
        # leave two preapprovals the payer could authorize (two monthly charges).
        User.objects.select_for_update().get(pk=user.pk)
        open_checkouts = user.provider_subscriptions.select_for_update().filter(
            status=S.PENDING, ended_at=None
        )
        reusable = open_checkouts.filter(
            plan=plan, currency=currency, amount=plan.price_ars_month
        ).first()
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
            return _start(provider, user, plan, currency)
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
    provider: PaymentProvider, user: User, plan: Plan, currency: str
) -> ProviderSubscription:
    try:
        checkout = provider.start_subscription(
            payer_email=user.email,
            reason=f"Gaucho Weather · plan {plan.name}",
            amount=plan.price_ars_month,
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
        amount=plan.price_ars_month,
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
        elif sub.status in STOPPED:
            if previous == S.PENDING:
                sub.ended_at = now  # never paid: there is no plan to take back
                sub.save(update_fields=["ended_at", "updated_at"])
            elif sub.next_payment_at is None or sub.next_payment_at <= now:
                _end(sub, now)
    return sub


def _end(sub: ProviderSubscription, now: datetime) -> None:
    """The paid month of a locked, cancelled subscription is over: back to Básico."""
    user = User.objects.get(pk=sub.user_id)
    replaced = (
        user.provider_subscriptions.exclude(pk=sub.pk)
        .filter(status__in=RUNNING, ended_at=None)
        .exists()
    )
    if not replaced and user.plan_id == sub.plan_id and not user.is_founder:
        plans.change_plan(user, Plan.BASICO, PlanChange.Reason.PAYMENT_ENDED)
    sub.ended_at = now
    sub.save(update_fields=["ended_at", "updated_at"])


def end_cancelled_subscriptions(now: datetime | None = None) -> int:
    """Move every cancelled or paused subscription whose paid month is over to Básico.

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


def current_subscription(user: User) -> ProviderSubscription | None:
    """The subscription the page shows: running, or cancelled but still in its paid month."""
    return (
        user.provider_subscriptions.exclude(status=S.PENDING)
        .filter(ended_at=None)
        .select_related("plan")
        .first()
    )


def cancel(user: User) -> ProviderSubscription:
    sub = user.provider_subscriptions.filter(status__in=RUNNING, ended_at=None).first()
    if sub is None:
        raise PaymentRefusal(404, NO_SUBSCRIPTION)
    try:
        remote = get_provider(sub.provider).cancel_subscription(sub.external_id)
    except ProviderError as exc:
        raise PaymentRefusal(502, PROVIDER_DOWN) from exc
    return sync_subscription(sub.provider, remote) or sub
