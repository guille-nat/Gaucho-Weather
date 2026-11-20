"""The terms bundle: Términos y condiciones, Política de privacidad and the program rules.

The texts live in the SPA (`frontend/src/pages/legal/`) and show this same version; a test on
each side catches a drift. A version is the date it takes effect. Changing a text means a new
version here and there (avisos-cambios S5):
- Ship it dated in the future and move the old one to EARLIER_VERSIONS. The terms promise: "se
  publicará una versión nueva con su fecha de vigencia y se avisará por email antes de que
  entre en vigencia". Until its date the old version stays in force and no dialog shows; the
  daily task emails every active account about the new one.
- From its date every account accepts it again through the blocking dialog (promociones S0c).
"""

from __future__ import annotations

import logging
from datetime import date

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.fields import empty

from .dates import long_date
from .models import TermsAcceptance, TermsNotice, User

logger = logging.getLogger(__name__)

# The texts the SPA ships: the newest version, maybe still to come.
TERMS_VERSION = "2026-11-19"
# The versions before it, oldest first. The last one is in force until TERMS_VERSION's date.
EARLIER_VERSIONS: tuple[str, ...] = ()
TERMS_REQUIRED = "Tenés que aceptar los términos y la política de privacidad."


class AcceptTermsField(serializers.BooleanField):
    """`acepta_terminos`: must be the JSON value true. Anything else, missing included, answers
    TERMS_REQUIRED: no loose truthy strings or numbers ("true", 1, "on") and no DRF messages."""

    def __init__(self, **kwargs):
        kwargs.setdefault("default", False)
        kwargs.setdefault("write_only", True)
        super().__init__(**kwargs)

    def run_validation(self, data=empty):
        if data is not True:
            raise serializers.ValidationError(TERMS_REQUIRED)
        return True


def upcoming_version(today: date | None = None) -> str | None:
    """The shipped version while it is not in force yet; None otherwise."""
    today = today or timezone.localdate()
    if EARLIER_VERSIONS and date.fromisoformat(TERMS_VERSION) > today:
        return TERMS_VERSION
    return None


def version_in_force(today: date | None = None) -> str:
    """The version accounts must have accepted today. The first version always is."""
    return EARLIER_VERSIONS[-1] if upcoming_version(today) else TERMS_VERSION


def has_accepted(user: User) -> bool:
    """Whether the account accepted the version in force."""
    return user.terms_acceptances.filter(version=version_in_force()).exists()


def record_acceptance(user: User, context: str) -> TermsAcceptance:
    """Accept the version in force and, before its date, the shipped one: the texts shown."""
    acceptance = TermsAcceptance.objects.create(
        user=user, version=version_in_force(), context=context
    )
    upcoming = upcoming_version()
    if upcoming and not user.terms_acceptances.filter(version=upcoming).exists():
        TermsAcceptance.objects.create(user=user, version=upcoming, context=context)
    return acceptance


NOTICE_SUBJECT = "Actualizamos los términos de Gaucho Weather"
NOTICE_BODY = (
    "Hola {name}:\n\n"
    "Actualizamos los Términos y condiciones, la Política de privacidad y las Reglas del "
    "programa. La versión nueva rige desde el {day}.\n\n"
    "- Podés leerla en {url}/terminos, {url}/privacidad y {url}/reglas.\n"
    "- Desde esa fecha, al entrar, la aplicación te va a pedir que la aceptes para seguir "
    "usando tu cuenta.\n"
    "- Si no estás de acuerdo, podés darte de baja de tu suscripción y borrar tu cuenta desde "
    "Perfil.\n\n"
    "Gaucho Weather"
)


def send_notices() -> int:
    """The daily task (avisos-cambios S5): one email per active account about the upcoming
    version; returns how many went out. A lost email is retried on the next run."""
    version = upcoming_version()
    if version is None:
        return 0
    for user_id in (
        User.objects.filter(is_active=True)
        .exclude(terms_notices__version=version)
        .values_list("pk", flat=True)
    ):
        TermsNotice.objects.get_or_create(user_id=user_id, version=version)
    pending = TermsNotice.objects.filter(
        version=version, sent_at=None, user__is_active=True
    ).values_list("pk", flat=True)
    return sum(_send(pk) for pk in list(pending))


def _send(notice_pk: int) -> bool:
    with transaction.atomic():
        notice = (
            TermsNotice.objects.select_for_update(skip_locked=True, of=("self",))
            .select_related("user")
            .filter(pk=notice_pk, sent_at=None)
            .first()
        )
        if notice is None:
            return False
        day = date.fromisoformat(notice.version)
        try:
            send_mail(
                NOTICE_SUBJECT,
                NOTICE_BODY.format(
                    name=notice.user.name,
                    day=long_date(day),
                    url=settings.PUBLIC_APP_URL,
                ),
                None,
                [notice.user.email],
            )
        except Exception:  # retried on the next run
            logger.exception("Could not send the terms notice %s", notice_pk)
            return False
        notice.sent_at = timezone.now()
        notice.save(update_fields=["sent_at"])
    return True
