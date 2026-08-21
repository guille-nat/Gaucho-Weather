"""
Armado y envío de los correos transaccionales.

Los tokens no se guardan en base: se firman. `TimestampSigner` produce un valor
verificable y con vencimiento propio, así que no hace falta una tabla de tokens
ni limpiarla después.
"""

import logging

from django.conf import settings
from django.core.mail import send_mail
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

logger = logging.getLogger(__name__)

EMAIL_VERIFY_SALT = "users.email-verify"
# 48 horas: suficiente para que alguien revise el correo el fin de semana.
EMAIL_VERIFY_MAX_AGE = 60 * 60 * 48


def build_email_verification_token(user):
    signer = TimestampSigner(salt=EMAIL_VERIFY_SALT)
    return signer.sign(str(user.pk))


def read_email_verification_token(token):
    """Devuelve el pk del usuario, o None si el token no sirve o venció."""
    signer = TimestampSigner(salt=EMAIL_VERIFY_SALT)
    try:
        return signer.unsign(token, max_age=EMAIL_VERIFY_MAX_AGE)
    except SignatureExpired:
        logger.info("Token de verificación vencido.")
        return None
    except BadSignature:
        logger.warning("Token de verificación inválido.")
        return None


def _send(subject, body, recipient):
    """
    Envía y reporta si falló, sin propagar la excepción.

    Un SMTP caído no debe hacer fallar el registro del usuario: la cuenta ya
    quedó creada y el correo se puede reenviar.
    """
    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient],
            fail_silently=False,
        )
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("No se pudo enviar el correo a %s: %s", recipient, exc)
        return False


def send_verification_email(user):
    token = build_email_verification_token(user)
    url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    body = (
        f"Hola {user.first_name or user.username},\n\n"
        "Confirmá tu correo para activar tu cuenta de Gaucho Weather:\n\n"
        f"{url}\n\n"
        "El enlace vence en 48 horas.\n"
        "Si no creaste esta cuenta, ignorá este mensaje.\n"
    )
    return _send("Confirmá tu cuenta de Gaucho Weather", body, user.email)


def send_password_reset_email(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    url = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
    body = (
        f"Hola {user.first_name or user.username},\n\n"
        "Pediste restablecer tu contraseña de Gaucho Weather:\n\n"
        f"{url}\n\n"
        "Si no fuiste vos, ignorá este mensaje: tu contraseña no cambia hasta "
        "que uses el enlace.\n"
    )
    return _send("Restablecer tu contraseña de Gaucho Weather", body, user.email)


def send_frost_alert_email(user, alert_data):
    """alert_data: dict con location_name, forecast_date, probability, min_temperature."""
    body = (
        f"Hola {user.first_name or user.username},\n\n"
        f"Riesgo de helada en {alert_data['location_name']}.\n\n"
        f"Fecha: {alert_data['forecast_date']}\n"
        f"Probabilidad: {alert_data['probability']}%\n"
        f"Temperatura mínima prevista: {alert_data['min_temperature']} °C\n\n"
        "Revisá el pronóstico completo en Gaucho Weather.\n"
    )
    return _send(
        f"Alerta de helada: {alert_data['location_name']}", body, user.email
    )


def decode_uid(uidb64):
    """Decodifica el uid del enlace de recupero; None si viene corrupto."""
    try:
        return force_str(urlsafe_base64_decode(uidb64))
    except (TypeError, ValueError, OverflowError):
        return None
