"""The terms bundle: Términos y condiciones, Política de privacidad and the program rules.

The texts live in the SPA (`frontend/src/pages/legal/`) and show this same version; a test on
each side catches a drift. Changing a text means a new version here and there: every account
then accepts it again through the blocking dialog (promociones S0b, S0c).
"""

from __future__ import annotations

from rest_framework import serializers
from rest_framework.fields import empty

from .models import TermsAcceptance, User

TERMS_VERSION = "2026-11-19"
TERMS_REQUIRED = "Tenés que aceptar los términos y la política de privacidad."


class AcceptTermsField(serializers.BooleanField):
    """`acepta_terminos`: must be true. Missing or false answers TERMS_REQUIRED."""

    def __init__(self, **kwargs):
        kwargs.setdefault("default", False)
        kwargs.setdefault("write_only", True)
        super().__init__(**kwargs)

    def run_validation(self, data=empty):
        if super().run_validation(data) is not True:
            raise serializers.ValidationError(TERMS_REQUIRED)
        return True


def has_accepted(user: User) -> bool:
    """Whether the account accepted the current version."""
    return user.terms_acceptances.filter(version=TERMS_VERSION).exists()


def record_acceptance(user: User, context: str) -> TermsAcceptance:
    return TermsAcceptance.objects.create(user=user, version=TERMS_VERSION, context=context)
