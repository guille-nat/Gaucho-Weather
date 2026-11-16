"""Password reset by email: a one-hour, single-use link to the SPA's /restablecer page.

The request always answers 204 and the email goes out from a Celery task, so neither the
answer nor its timing tells whether an account exists for that address.
"""

from __future__ import annotations

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from .models import User

SUBJECT = "Restablecé tu contraseña de Gaucho Weather"
BODY = (
    "Hola {name}:\n\n"
    "Pediste restablecer tu contraseña. Entrá a este enlace para elegir una nueva:\n\n"
    "{link}\n\n"
    "El enlace vence en 1 hora y sirve una sola vez. Si no lo pediste, ignorá este mensaje: "
    "tu contraseña no cambia.\n\n"
    "Gaucho Weather"
)


def reset_link(user: User) -> str:
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    return f"{settings.PUBLIC_APP_URL}/restablecer/{uid}/{token}"


def send_reset_email(email: str) -> bool:
    """Email a reset link to the active account with this address, if there is one."""
    user = User.objects.filter(email__iexact=email.strip(), is_active=True).first()
    if user is None:
        return False
    body = BODY.format(name=user.name, link=reset_link(user))
    send_mail(SUBJECT, body, None, [user.email])
    return True


def user_for_link(uid: str, token: str) -> User | None:
    """The account a link belongs to, or None when the link is malformed, used or expired."""
    try:
        pk = int(force_str(urlsafe_base64_decode(uid)))
    except (TypeError, ValueError, OverflowError, UnicodeDecodeError):
        return None
    user = User.objects.filter(pk=pk, is_active=True).first()
    if user is None or not default_token_generator.check_token(user, token):
        return None
    return user
