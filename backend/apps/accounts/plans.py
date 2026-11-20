"""Plans, founder slots and the Productor trial.

The first `FounderProgram.limit` sign-ups are founders: Productor for free, forever. Everyone
after them gets Productor for `trial_days` and then moves to Básico. A founder slot is never
handed out twice, even when its account is deleted. There is no payment yet: staff move users
between plans from the admin: users ask for a change or a cancellation (PlanRequest) and staff
apply it. Every move between plans is recorded as a PlanChange (S14).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.db import connection, transaction
from django.utils import timezone
from rest_framework.exceptions import APIException

from .models import Courtesy, FounderProgram, Plan, PlanChange, PlanRequest, User

logger = logging.getLogger(__name__)

# Seeded by migration 0003 (keep both in sync). Prices start empty: "Precio a confirmar".
DEFAULT_PLANS: dict[str, dict] = {
    Plan.BASICO: {
        "name": "Básico",
        "max_lotes": 2,
        "max_alert_rules": 3,
        "allows_push": False,
        "priority_support": False,
        "highlighted": False,
        "order": 1,
    },
    Plan.PRODUCTOR: {
        "name": "Productor",
        "max_lotes": 15,
        "max_alert_rules": None,
        "allows_push": True,
        "priority_support": False,
        "highlighted": True,
        "order": 2,
    },
    Plan.EMPRESA: {
        "name": "Empresa",
        "max_lotes": None,
        "max_alert_rules": None,
        "allows_push": True,
        "priority_support": True,
        "highlighted": False,
        "order": 3,
    },
}


def ensure_default_plans() -> None:
    """Create any missing default plan and the founder program row; never edits existing ones."""
    for code, fields in DEFAULT_PLANS.items():
        Plan.objects.get_or_create(code=code, defaults=fields)
    FounderProgram.objects.get_or_create(pk=1)


def start_membership(user: User, now: datetime | None = None) -> User:
    """Give a new account a founder slot if one is left, else the Productor trial.

    Must run inside the transaction that created the user: the founder program row is locked
    until it commits, so concurrent sign-ups take numbers one after the other.
    """
    now = now or timezone.now()
    program, _ = FounderProgram.objects.select_for_update().get_or_create(pk=1)
    user.plan_id = Plan.PRODUCTOR
    if program.next_number <= program.limit:
        user.founder_number = program.next_number
        user.plan_expires_at = None
        program.next_number += 1
        program.save(update_fields=["next_number"])
    else:
        user.plan_expires_at = now + timedelta(days=program.trial_days)
    user.save(update_fields=["plan", "plan_expires_at", "founder_number"])
    reason = PlanChange.Reason.FOUNDER if user.is_founder else PlanChange.Reason.TRIAL
    PlanChange.objects.create(user=user, to_plan_id=Plan.PRODUCTOR, reason=reason, at=now)
    return user


def _switch(
    user: User, plan_code: str, reason: str, now: datetime, by: User | None = None, note: str = ""
) -> PlanChange | None:
    """Move a locked user to `plan_code` and record it. Same plan: nothing to record.

    Only a trial keeps an expiry: any other change is for good until the next one. Any move
    that is not the cortesía itself ends an active cortesía (cortesias S3, S4): a payment, a
    staff change, a trial or founder grant, or its own end.
    """
    from_plan = user.plan_id
    keeps_trial_plan = (
        from_plan == plan_code
        and user.plan_expires_at is not None
        and reason != PlanChange.Reason.TRIAL
    )
    if from_plan == plan_code and not keeps_trial_plan:
        return None
    user.plan_id = plan_code
    if reason != PlanChange.Reason.TRIAL:
        user.plan_expires_at = None
    user.save(update_fields=["plan", "plan_expires_at"])
    if reason != PlanChange.Reason.COURTESY:
        user.courtesies.filter(ended_at=None).update(ended_at=now)
    return PlanChange.objects.create(
        user=user,
        from_plan_id=from_plan,
        to_plan_id=plan_code,
        reason=reason,
        at=now,
        by=by,
        note=note,
    )


def change_plan(
    user: User, plan_code: str, reason: str, *, by: User | None = None, note: str = ""
) -> PlanChange | None:
    """Move `user` to `plan_code` and record why (a request applied, a staff edit)."""
    with transaction.atomic():
        locked = User.objects.select_for_update().get(pk=user.pk)
        change = _switch(locked, plan_code, reason, timezone.now(), by=by, note=note)
    user.plan_id, user.plan_expires_at = locked.plan_id, locked.plan_expires_at
    return change


def membership_status(user: User) -> str:
    """founder / trial / active, as the subscription page shows it."""
    if user.founder_number is not None:
        return "founder"
    if user.plan_expires_at is not None:
        return "trial"
    return "active"


class PlanLimitExceeded(APIException):
    """402, not 403: the SPA reads any non-CSRF 403 as a lost session and signs out."""

    status_code = 402
    default_code = "plan_limit"

    def __init__(self, message: str):
        # A dict detail is returned as the body as is: {"detail": ..., "code": "plan_limit"}.
        super().__init__({"detail": message, "code": self.default_code})


# kind -> (Plan field with the cap, related name on User, noun in the message)
LIMITS = {
    "lotes": ("max_lotes", "lotes", "lotes"),
    "alert_rules": ("max_alert_rules", "alert_rules", "reglas de alerta"),
}


def check_limit(user: User, kind: str) -> None:
    """Refuse one more `kind` when the plan's cap is reached.

    Must run inside the transaction that creates the row: it locks the account so two
    parallel creates cannot both pass the count.
    """
    field, related, noun = LIMITS[kind]
    locked = User.objects.select_for_update().select_related("plan").get(pk=user.pk)
    cap = getattr(locked.plan, field)
    if cap is not None and getattr(locked, related).count() >= cap:
        raise PlanLimitExceeded(
            f"Tu plan {locked.plan.name} permite hasta {cap} {noun}. "
            "Mirá los planes para sumar más."
        )


@dataclass(frozen=True)
class Usage:
    lotes: int
    alert_rules: int


def usage(user: User) -> Usage:
    return Usage(lotes=user.lotes.count(), alert_rules=user.alert_rules.count())


def rule_ids_within_plan(user: User) -> set[int]:
    """The rules the plan covers: the oldest ones up to its cap. The rest pause, not vanish."""
    rules = user.alert_rules.order_by("created_at", "id").values_list("id", flat=True)
    cap = user.plan.max_alert_rules
    return set(rules if cap is None else rules[:cap])


TRIAL_ENDED_SUBJECT = "Terminó tu prueba de Productor"
TRIAL_ENDED_BODY = (
    "Hola {name}:\n\n"
    "Terminó tu prueba del plan Productor y tu cuenta pasó al plan {plan}.\n"
    "Tus lotes y reglas siguen guardados, pero el plan {plan} {limits}.\n\n"
    "Podés ver los planes en {url}/planes\n\n"
    "Gaucho Weather"
)


def _describe_limits(plan: Plan) -> str:
    parts = [] if plan.allows_push else ["no envía notificaciones push"]
    caps = []
    if plan.max_lotes is not None:
        caps.append(f"{plan.max_lotes} lotes")
    if plan.max_alert_rules is not None:
        caps.append(f"{plan.max_alert_rules} reglas de alerta")
    if caps:
        parts.append("permite hasta " + " y ".join(caps))
    return " y ".join(parts) or "tiene otras condiciones"


def expire_trials(now: datetime | None = None) -> int:
    """Move every expired Productor trial to Básico and tell the user by email. Idempotent.

    Only trials: an expiry staff set on another plan is left for staff to handle.
    """
    now = now or timezone.now()
    moved = 0
    trials = User.objects.filter(plan_id=Plan.PRODUCTOR, founder_number=None).exclude(
        pk__in=Courtesy.objects.filter(ended_at=None).values("user_id")
    )
    candidates = trials.filter(plan_expires_at__lte=now).values_list("pk", flat=True)
    for pk in candidates:
        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=pk)
            if (
                user.plan_id != Plan.PRODUCTOR
                or user.plan_expires_at is None
                or user.plan_expires_at > now
                or user.courtesies.filter(ended_at=None).exists()
            ):
                continue  # changed by staff meanwhile
            _switch(user, Plan.BASICO, PlanChange.Reason.TRIAL_ENDED, now)
            transaction.on_commit(lambda user=user: _send_trial_ended(user))
        moved += 1
    return moved


def _send_trial_ended(user: User) -> None:
    try:
        basico = Plan.objects.get(code=Plan.BASICO)
        body = TRIAL_ENDED_BODY.format(
            name=user.name,
            plan=basico.name,
            limits=_describe_limits(basico),
            url=settings.PUBLIC_APP_URL,
        )
        send_mail(
            TRIAL_ENDED_SUBJECT,
            body,
            None,
            [user.email],
        )
    except Exception:  # the downgrade already happened; a lost email must not undo it
        logger.exception("Could not send the trial-ended email to user %s", user.pk)


# --- Cortesías (odd/tasks/cortesias.md) ----------------------------------------------------

COURTESY_PLANS = (Plan.PRODUCTOR, Plan.EMPRESA)
COURTESY_MAX_DAYS = 365  # "no superior a 1 año"
COURTESY_CAP = 20  # active at once (assumption in the spec)
COURTESY_REMINDER_DAYS = 7
COURTESY_CAP_REACHED = "Ya hay 20 cortesías activas. Revocá alguna antes de dar otra."
COURTESY_WINDOW_DAYS = 730  # "1 año en 2 años" (cortesias L5)
COURTESY_YEAR_IN_TWO = "Una cuenta suma como máximo un año de cortesía cada 2 años: "
COURTESY_LAST_DAY = COURTESY_YEAR_IN_TWO + "esta puede terminar como máximo el {date}."
COURTESY_NOT_YET = COURTESY_YEAR_IN_TWO + "puede recibir otra desde el {date}."
# Taken by every new grant before counting the active ones (any constant shared by all).
COURTESY_CAP_LOCK = 0x636F7274  # "cort"


class CourtesyError(Exception):
    """A cortesía the super admin cannot give; the message is shown as is."""


def free_plan(user: User) -> str:
    """Where an account goes when nothing pays for its plan: Básico, or Productor for a founder."""
    return Plan.PRODUCTOR if user.is_founder else Plan.BASICO


def active_courtesy(user: User) -> Courtesy | None:
    return user.courtesies.filter(ended_at=None).first()


def _day(moment: datetime) -> str:
    return timezone.localdate(moment).strftime("%d/%m/%Y")


Span = tuple[date, date]  # local days [start, end): its length is end - start


def _overlap(span: Span, start: date, end: date) -> int:
    return max((min(span[1], end) - max(span[0], start)).days, 0)


def _within_year_in_two(past: list[Span], candidate: Span) -> bool:
    """No 730-day window touching `candidate` sums more than 365 days of cortesía.

    The busiest window starts at some span's start or ends at some span's end, so only
    those are checked.
    """
    window = timedelta(days=COURTESY_WINDOW_DAYS)
    spans = [*past, candidate]
    starts = {s for s, _ in spans} | {e - window for _, e in spans}
    for start in starts:
        end = start + window
        if _overlap(candidate, start, end) == 0:
            continue
        if sum(_overlap(span, start, end) for span in spans) > COURTESY_MAX_DAYS:
            return False
    return True


def _past_spans(user: User, active: Courtesy | None) -> list[Span]:
    """Every ended cortesía: a revoked one counts up to its revoke, an expired one up to its
    end (not to when the daily task ran)."""
    ended = user.courtesies.exclude(ended_at=None)
    if active is not None:
        ended = ended.exclude(pk=active.pk)
    return [
        (timezone.localdate(c.starts_at), timezone.localdate(min(c.ended_at, c.ends_at)))
        for c in ended
    ]


def _refuse_over_a_year_in_two(user: User, active: Courtesy | None, ends_at: datetime) -> None:
    """Raise with the latest end the cortesía could have, or the day a new one is possible."""
    today = timezone.localdate()
    start = timezone.localdate(active.starts_at) if active else today
    past = _past_spans(user, active)
    last = timezone.localdate(ends_at)
    if _within_year_in_two(past, (start, last)):
        return
    while last > today and not _within_year_in_two(past, (start, last)):
        last -= timedelta(days=1)
    if last > today:
        raise CourtesyError(COURTESY_LAST_DAY.format(date=last.strftime("%d/%m/%Y")))
    day = today + timedelta(days=1)
    while not _within_year_in_two(past, (day, day + timedelta(days=1))):
        day += timedelta(days=1)
    raise CourtesyError(COURTESY_NOT_YET.format(date=day.strftime("%d/%m/%Y")))


def grant_courtesy(
    user: User, plan_code: str, ends_at: datetime, reason: str, *, by: User
) -> tuple[Courtesy, str]:
    """Give `plan_code` for free until `ends_at`, or change the active cortesía's plan or date.

    `user` must be locked by the caller (who also refuses paying accounts). Returns the
    cortesía and the plan the account was on. Raises CourtesyError.
    """
    now = timezone.now()
    courtesy = user.courtesies.select_for_update().filter(ended_at=None).first()
    if courtesy is None:
        # One lock every new grant shares, held until commit: the count below is a new
        # statement, so it sees a grant that committed while this one waited.
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", [COURTESY_CAP_LOCK])
        if Courtesy.objects.filter(ended_at=None).count() >= COURTESY_CAP:
            raise CourtesyError(COURTESY_CAP_REACHED)
    _refuse_over_a_year_in_two(user, courtesy, ends_at)
    if courtesy is None:
        courtesy = Courtesy(user=user, starts_at=now)
    from_plan = user.plan_id
    if courtesy.pk is None or from_plan != plan_code:
        _switch(user, plan_code, PlanChange.Reason.COURTESY, now, by=by, note=reason)
    user.plan_expires_at = ends_at
    user.save(update_fields=["plan_expires_at"])
    courtesy.plan_id, courtesy.ends_at, courtesy.reason = plan_code, ends_at, reason
    courtesy.granted_by = courtesy.granted_by or by
    courtesy.save()
    return courtesy, from_plan


def revoke_courtesy(user: User, *, by: User) -> tuple[Courtesy, PlanChange] | None:
    """End the locked user's active cortesía now: back to the free plan. None without one."""
    courtesy = active_courtesy(user)
    if courtesy is None:
        return None
    change = _switch(user, free_plan(user), PlanChange.Reason.COURTESY_ENDED, timezone.now(), by=by)
    return courtesy, change


def end_courtesies(now: datetime | None = None) -> int:
    """Move every cortesía whose date passed to the free plan and email the account. Idempotent.

    Runs in the daily `accounts.expire_trials` task, before the trials.
    """
    now = now or timezone.now()
    due = Courtesy.objects.filter(ended_at=None, ends_at__lte=now).values_list("pk", flat=True)
    ended = 0
    for pk in due:
        with transaction.atomic():
            courtesy = Courtesy.objects.select_for_update().get(pk=pk)
            if courtesy.ended_at is not None or courtesy.ends_at > now:
                continue  # revoked or given again meanwhile
            user = User.objects.select_for_update().get(pk=courtesy.user_id)
            _switch(user, free_plan(user), PlanChange.Reason.COURTESY_ENDED, now)
            transaction.on_commit(lambda c=courtesy, u=user: _send_courtesy_ended(c, u))
        ended += 1
    return ended


def remind_courtesies(now: datetime | None = None) -> int:
    """One email, about a week before the end, inviting the account to subscribe."""
    now = now or timezone.now()
    soon = Courtesy.objects.filter(
        ended_at=None,
        reminder_sent_at=None,
        ends_at__gt=now,
        ends_at__lte=now + timedelta(days=COURTESY_REMINDER_DAYS),
    ).values_list("pk", flat=True)
    sent = 0
    for pk in soon:
        with transaction.atomic():
            courtesy = Courtesy.objects.select_for_update().select_related("user").get(pk=pk)
            if courtesy.ended_at is not None or courtesy.reminder_sent_at is not None:
                continue
            courtesy.reminder_sent_at = now
            courtesy.save(update_fields=["reminder_sent_at"])
            transaction.on_commit(lambda c=courtesy: _send_courtesy_reminder(c))
        sent += 1
    return sent


COURTESY_REMINDER_SUBJECT = "Tu cortesía del plan {plan} termina el {date}"
COURTESY_REMINDER_BODY = (
    "Hola {name}:\n\n"
    "Tu cortesía del plan {plan} termina el {date}. Después tu cuenta pasa al plan {free}.\n\n"
    "Si querés seguir con el plan {plan}, podés suscribirte en {url}/planes\n\n"
    "Gaucho Weather"
)
COURTESY_ENDED_SUBJECT = "Terminó tu cortesía del plan {plan}"
COURTESY_ENDED_BODY = (
    "Hola {name}:\n\n"
    "Terminó tu cortesía del plan {plan} y tu cuenta pasó al plan {free}.\n"
    "Tus lotes y reglas siguen guardados, pero el plan {free} {limits}.\n\n"
    "Para seguir con el plan {plan}, suscribite en {url}/planes\n\n"
    "Gaucho Weather"
)


def _send_courtesy_reminder(courtesy: Courtesy) -> None:
    try:
        user = courtesy.user
        plan = Plan.objects.get(code=courtesy.plan_id)
        free = Plan.objects.get(code=free_plan(user))
        date = _day(courtesy.ends_at)
        body = COURTESY_REMINDER_BODY.format(
            name=user.name, plan=plan.name, date=date, free=free.name, url=settings.PUBLIC_APP_URL
        )
        send_mail(
            COURTESY_REMINDER_SUBJECT.format(plan=plan.name, date=date), body, None, [user.email]
        )
    except Exception:  # marked as sent already; a lost reminder must not stop the others
        logger.exception("Could not send the cortesía reminder %s", courtesy.pk)


def _send_courtesy_ended(courtesy: Courtesy, user: User) -> None:
    try:
        plan = Plan.objects.get(code=courtesy.plan_id)
        free = Plan.objects.get(code=user.plan_id)
        body = COURTESY_ENDED_BODY.format(
            name=user.name,
            plan=plan.name,
            free=free.name,
            limits=_describe_limits(free),
            url=settings.PUBLIC_APP_URL,
        )
        send_mail(COURTESY_ENDED_SUBJECT.format(plan=plan.name), body, None, [user.email])
    except Exception:  # the downgrade already happened; a lost email must not undo it
        logger.exception("Could not send the cortesía-ended email to user %s", user.pk)


# --- Plan requests (S14) -------------------------------------------------------------------

ALREADY_ON_PLAN = "Ya estás en el plan {name}."
REQUEST_PENDING = "Ya tenés un pedido pendiente."
NO_SUCH_PLAN = "Ese plan no existe."
FOUNDER_PAYS_EMPRESA = "Como founder, Empresa se paga con Mercado Pago: pagás solo la diferencia."


class PlanRequestError(Exception):
    """A request the user cannot make; the message is shown as is."""


def refuse_free_empresa(user: User, plan_code: str) -> None:
    """A founder moves up to Empresa only by paying the difference (promociones SF4).

    So neither a request nor staff can give it for free by mistake. Raises PlanRequestError.
    """
    if user.is_founder and plan_code == Plan.EMPRESA and user.plan_id != Plan.EMPRESA:
        raise PlanRequestError(FOUNDER_PAYS_EMPRESA)


def request_plan(user: User, kind: str, plan_code: str | None = None) -> PlanRequest:
    """Record a pending request to change plan, or to cancel down to Básico."""
    if kind == PlanRequest.Kind.CANCEL:
        plan_code = Plan.BASICO
    plan = Plan.objects.filter(code=plan_code).first() if plan_code else None
    if plan is None:
        raise PlanRequestError(NO_SUCH_PLAN)
    with transaction.atomic():
        # Locking the account serializes two requests sent at once; the conditional unique
        # constraint on PlanRequest backs it up.
        locked = User.objects.select_for_update().get(pk=user.pk)
        # On a trial, asking for the same plan means "keep it after the trial".
        on_trial = locked.plan_expires_at is not None and locked.founder_number is None
        if locked.plan_id == plan.code and not on_trial:
            raise PlanRequestError(ALREADY_ON_PLAN.format(name=plan.name))
        refuse_free_empresa(locked, plan.code)
        if locked.plan_requests.filter(status=PlanRequest.Status.PENDING).exists():
            raise PlanRequestError(REQUEST_PENDING)
        return PlanRequest.objects.create(user=locked, kind=kind, plan=plan)


def pending_request(user: User) -> PlanRequest | None:
    return user.plan_requests.filter(status=PlanRequest.Status.PENDING).first()


def _resolve(request: PlanRequest, status: str, by: User | None) -> None:
    request.status = status
    request.resolved_at = timezone.now()
    request.resolved_by = by
    request.save(update_fields=["status", "resolved_at", "resolved_by"])


def withdraw_request(user: User) -> bool:
    """Withdraw the user's pending request. False when there is none."""
    with transaction.atomic():
        request = (
            user.plan_requests.select_for_update().filter(status=PlanRequest.Status.PENDING).first()
        )
        if request is None:
            return False
        _resolve(request, PlanRequest.Status.WITHDRAWN, user)
    return True


def apply_request(request_id: int, by: User) -> bool:
    """Staff apply a pending request: move the plan, record it, email the user after commit.

    False when the request is no longer pending (withdrawn or resolved by someone else).
    Raises PlanRequestError for a founder's request to Empresa, which stays pending.
    """
    with transaction.atomic():
        request = PlanRequest.objects.select_for_update().select_related("user").get(pk=request_id)
        if request.status != PlanRequest.Status.PENDING:
            return False
        refuse_free_empresa(
            User.objects.select_for_update().get(pk=request.user_id), request.plan_id
        )
        change_plan(request.user, request.plan_id, PlanChange.Reason.REQUEST, by=by)
        _resolve(request, PlanRequest.Status.APPLIED, by)
        user = request.user
        transaction.on_commit(lambda: _send_plan_changed(user))
    return True


def reject_request(request_id: int, by: User) -> bool:
    with transaction.atomic():
        request = PlanRequest.objects.select_for_update().get(pk=request_id)
        if request.status != PlanRequest.Status.PENDING:
            return False
        _resolve(request, PlanRequest.Status.REJECTED, by)
    return True


PLAN_CHANGED_SUBJECT = "Tu plan ahora es {plan}"
PLAN_CHANGED_BODY = (
    "Hola {name}:\n\n"
    "Aplicamos tu pedido: tu plan ahora es {plan}.\n\n"
    "Podés ver tu suscripción en {url}/perfil/suscripcion\n\n"
    "Gaucho Weather"
)


def _send_plan_changed(user: User) -> None:
    try:
        plan = Plan.objects.get(code=user.plan_id)
        body = PLAN_CHANGED_BODY.format(name=user.name, plan=plan.name, url=settings.PUBLIC_APP_URL)
        send_mail(PLAN_CHANGED_SUBJECT.format(plan=plan.name), body, None, [user.email])
    except Exception:  # the change already happened; a lost email must not undo it
        logger.exception("Could not send the plan-changed email to user %s", user.pk)
