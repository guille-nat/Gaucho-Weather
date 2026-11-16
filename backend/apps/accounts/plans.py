"""Plans, founder slots and the Productor trial.

The first `FounderProgram.limit` sign-ups are founders: Productor for free, forever. Everyone
after them gets Productor for `trial_days` and then moves to Básico. A founder slot is never
handed out twice, even when its account is deleted. There is no payment yet: staff move users
between plans from the admin.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import APIException

from .models import FounderProgram, Plan, User

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
    return user


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
    trials = User.objects.filter(plan_id=Plan.PRODUCTOR, founder_number=None)
    candidates = trials.filter(plan_expires_at__lte=now).values_list("pk", flat=True)
    for pk in candidates:
        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=pk)
            if (
                user.plan_id != Plan.PRODUCTOR
                or user.plan_expires_at is None
                or user.plan_expires_at > now
            ):
                continue  # changed by staff meanwhile
            user.plan_id = Plan.BASICO
            user.plan_expires_at = None
            user.save(update_fields=["plan", "plan_expires_at"])
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
