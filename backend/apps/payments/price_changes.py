"""Scheduled price changes and their notice emails (avisos-cambios S1, S2).

The terms promise: "Un cambio de precio se avisa por email con al menos 30 días de
anticipación y rige desde el cobro siguiente a ese plazo." So a change is scheduled at least
30 days ahead, and every running subscription whose amount changes gets a PriceNotice. Its
email is the notice: a subscription only changes amount 30 days after `sent_at` (and never
before the change's date). A lost email is retried by the daily task; a notice is sent at most
once.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Plan, User

from .models import PriceChange, PriceNotice, ProviderSubscription
from .services import RUNNING, PaymentRefusal, ars_prices, pesos, price_for

logger = logging.getLogger(__name__)

NOTICE_DAYS = 30
TOO_SOON = "La fecha tiene que ser al menos 30 días después de hoy."
BASICO_IS_FREE = "El plan Básico es gratis: no se le programa un precio."
ALREADY_PENDING = (
    "Ese plan ya tiene un cambio de precio programado. Cancelalo antes de programar otro."
)
NONE_PENDING = "Ese plan no tiene un cambio de precio programado."

MONTHS = (
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
)

NOTICE_SUBJECT = "Cambia el precio de tu plan {plan}"
NOTICE_BODY = (
    "Hola {name}:\n\n"
    "El precio de tu plan {plan} pasa de {old} a {new} por mes.{founder}\n\n"
    "- Rige desde el primer cobro a partir del {applies_on}. Hasta entonces seguís pagando "
    "{old}.\n"
    "- No tenés que hacer nada: Mercado Pago te cobra el monto nuevo solo.\n"
    "- Si no querés seguir, podés darte de baja en {url}/perfil/suscripcion. Seguís con el "
    "plan hasta el final del mes que ya pagaste y no te cobramos más.\n\n"
    "Términos y condiciones: {url}/terminos\n\n"
    "Gaucho Weather"
)
NOTICE_FOUNDER = " Como founder pagás solo la diferencia con Productor."


def long_date(day: date) -> str:
    """The SPA's long date: "20 de diciembre de 2026"."""
    return f"{day.day} de {MONTHS[day.month - 1]} de {day.year}"


def earliest_date() -> date:
    return timezone.localdate() + timedelta(days=NOTICE_DAYS)


def pending_change(plan: Plan) -> PriceChange | None:
    return plan.price_changes.filter(cancelled_at=None, applied_at=None).first()


def schedule(actor: User, plan: Plan, price_ars_month: int, effective_on: date) -> PriceChange:
    """S1: save the change and create its notices; the emails go out after the commit."""
    if plan.code == Plan.BASICO:
        raise PaymentRefusal(400, BASICO_IS_FREE)
    with transaction.atomic():
        Plan.objects.select_for_update().get(pk=plan.pk)  # one scheduler at a time per plan
        if pending_change(plan) is not None:
            raise PaymentRefusal(409, ALREADY_PENDING)
        change = PriceChange.objects.create(
            plan=plan, price_ars_month=price_ars_month, effective_on=effective_on, created_by=actor
        )
        create_notices(change)
        transaction.on_commit(_send_later)
    return change


def cancel(plan: Plan) -> PriceChange:
    """S1: a pending change is dropped; its notices are never sent or applied."""
    with transaction.atomic():
        change = (
            plan.price_changes.select_for_update()
            .filter(cancelled_at=None, applied_at=None)
            .first()
        )
        if change is None:
            raise PaymentRefusal(404, NONE_PENDING)
        change.cancelled_at = timezone.now()
        change.save(update_fields=["cancelled_at"])
    return change


def create_notices(change: PriceChange) -> int:
    """A notice for every running subscription whose amount the change moves. Idempotent."""
    prices = {**ars_prices(), change.plan_id: change.price_ars_month}
    affected = (
        ProviderSubscription.objects.filter(status__in=RUNNING, ended_at=None)
        .exclude(price_notices__change=change)
        .select_related("user", "plan")
    )
    if change.applied_at is not None:
        affected = affected.filter(created_at__lt=change.applied_at)
    if change.plan_id == Plan.PRODUCTOR:  # founders pay Empresa minus Productor
        affected = affected.filter(plan_id__in=(Plan.PRODUCTOR, Plan.EMPRESA))
    else:
        affected = affected.filter(plan_id=change.plan_id)
    created = 0
    for sub in affected:
        new_amount = price_for(sub.user, sub.plan, prices)
        if new_amount is None or new_amount == sub.amount:
            continue
        PriceNotice.objects.create(
            change=change, subscription=sub, old_amount=sub.amount, new_amount=new_amount
        )
        created += 1
    return created


def _send_later() -> None:
    from .tasks import send_price_notices

    send_price_notices.delay()


def send_pending_notices() -> int:
    """Send every unsent notice of a change still standing; returns how many went out."""
    pending = PriceNotice.objects.filter(sent_at=None, change__cancelled_at=None).values_list(
        "pk", flat=True
    )
    return sum(_send(pk) for pk in list(pending))


def _send(notice_pk: int) -> bool:
    with transaction.atomic():
        notice = (
            PriceNotice.objects.select_for_update(skip_locked=True, of=("self",))
            .select_related("change", "subscription__user", "subscription__plan")
            .filter(pk=notice_pk, sent_at=None, change__cancelled_at=None)
            .first()
        )
        if notice is None:  # sent meanwhile, cancelled, or another worker has it
            return False
        now = timezone.now()
        user = notice.subscription.user
        try:
            send_mail(
                NOTICE_SUBJECT.format(plan=notice.subscription.plan.name),
                NOTICE_BODY.format(
                    name=user.name,
                    plan=notice.subscription.plan.name,
                    old=pesos(notice.old_amount),
                    new=pesos(notice.new_amount),
                    founder=NOTICE_FOUNDER if user.is_founder else "",
                    applies_on=long_date(applies_on(notice.change, now)),
                    url=settings.PUBLIC_APP_URL,
                ),
                None,
                [user.email],
            )
        except Exception:  # retried by the daily task; the old amount stays meanwhile
            logger.exception("Could not send the price notice %s", notice_pk)
            return False
        notice.sent_at = now
        notice.save(update_fields=["sent_at"])
    return True


def applies_on(change: PriceChange, sent_at) -> date:
    """S3: 30 days after the notice, and never before the change's date."""
    return max(change.effective_on, timezone.localdate(sent_at) + timedelta(days=NOTICE_DAYS))


def daily_notices() -> int:
    """The daily task's notice part: late subscribers of each plan's newest standing change,
    then every unsent notice. Once a change is applied, only subscriptions created before it
    can still pay the old price (a checkout opened earlier); later ones were priced at checkout.
    """
    newest: dict[str, PriceChange] = {}
    for change in PriceChange.objects.filter(cancelled_at=None).order_by(
        "plan_id", "-created_at", "-id"
    ):
        newest.setdefault(change.plan_id, change)
    for change in newest.values():
        create_notices(change)
    return send_pending_notices()
