import logging

from django.contrib.auth.tokens import default_token_generator
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from .emails import (
    decode_uid,
    read_email_verification_token,
    send_password_reset_email,
    send_verification_email,
)
from .models import CustomUser, FrostAlert, UserPreferences
from .serializers import (
    FrostAlertSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    UserPreferencesSerializer,
    UserSerializer,
)

logger = logging.getLogger(__name__)


class PasswordResetThrottle(AnonRateThrottle):
    """
    Límite propio: el recupero manda correo y es blanco fácil de abuso.

    El valor NO va hardcodeado acá: un atributo `rate` de clase le gana a la
    configuración y deja el límite activo incluso en los tests.
    Se define en DEFAULT_THROTTLE_RATES['password_reset'].
    """

    scope = "password_reset"


@api_view(["POST"])
@permission_classes([AllowAny])
def create_users(request):
    serializer = UserSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        # Si el correo falla, la cuenta igual queda creada: se puede reenviar.
        send_verification_email(user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_user_whit_preferences(request):
    """
    Devuelve tanto el user como sus preferencias para los datos del perfil. El usuario debe de estar autenticado.
    """
    user = request.user
    user_serializer = UserSerializer(user)
    # get_or_create en lugar de 404: un usuario sin preferencias es un estado
    # que no debería existir, y devolver 404 rompía el perfil entero.
    user_preferences, _ = UserPreferences.objects.get_or_create(user=user)
    preferences_serializer = UserPreferencesSerializer(user_preferences)

    return Response(
        {"user": user_serializer.data, "preferences": preferences_serializer.data},
        status=status.HTTP_200_OK,
    )


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_user(request):
    user = request.user
    serializer = UserSerializer(instance=user, data=request.data, partial=True)

    if serializer.is_valid():
        # Cambiar el email invalida la verificación: hay que confirmar el nuevo.
        new_email = serializer.validated_data.get("email")
        email_changed = bool(new_email) and new_email != user.email

        updated_user = serializer.save()

        if email_changed:
            updated_user.email_verify = False
            updated_user.save(update_fields=["email_verify"])
            send_verification_email(updated_user)

        return Response(serializer.data, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_preferences(request):
    user = request.user  # Obtenemos el usuario autenticado
    preferences_instance, _ = UserPreferences.objects.get_or_create(user=user)

    serializer = UserPreferencesSerializer(
        instance=preferences_instance,
        data=request.data,
        partial=True,
    )

    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
@permission_classes([AllowAny])
def verify_email(request):
    """Confirma la casilla a partir del token enviado por correo."""
    token = request.data.get("token", "")
    user_pk = read_email_verification_token(token)
    if not user_pk:
        return Response(
            {"error": "El enlace de verificación es inválido o venció."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user = CustomUser.objects.get(pk=user_pk)
    except CustomUser.DoesNotExist:
        return Response(
            {"error": "El enlace de verificación es inválido o venció."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not user.email_verify:
        user.email_verify = True
        user.save(update_fields=["email_verify"])

    return Response({"detail": "Cuenta verificada."}, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def resend_verification_email(request):
    user = request.user
    if user.email_verify:
        return Response(
            {"detail": "La cuenta ya está verificada."}, status=status.HTTP_200_OK
        )
    send_verification_email(user)
    return Response(
        {"detail": "Te reenviamos el correo de verificación."},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetThrottle])
def password_reset_request(request):
    """
    Inicia el recupero de contraseña.

    Responde siempre 200, exista o no la cuenta. Si distinguiéramos los casos,
    el endpoint serviría para averiguar qué correos están registrados.
    """
    serializer = PasswordResetRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    email = serializer.validated_data["email"].lower()
    user = CustomUser.objects.filter(email__iexact=email).first()
    if user:
        send_password_reset_email(user)
    else:
        logger.info("Recupero solicitado para un email sin cuenta.")

    return Response(
        {"detail": "Si el correo está registrado, te enviamos las instrucciones."},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetThrottle])
def password_reset_confirm(request):
    """Fija la nueva contraseña si el token del correo es válido."""
    serializer = PasswordResetConfirmSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    invalid = Response(
        {"error": "El enlace de recupero es inválido o venció."},
        status=status.HTTP_400_BAD_REQUEST,
    )

    user_pk = decode_uid(serializer.validated_data["uid"])
    if not user_pk:
        return invalid

    user = CustomUser.objects.filter(pk=user_pk).first()
    if not user:
        return invalid

    # El token de Django incluye el hash de la contraseña actual, así que deja
    # de ser válido apenas se usa una vez.
    if not default_token_generator.check_token(user, serializer.validated_data["token"]):
        return invalid

    user.set_password(serializer.validated_data["new_password"])
    user.save(update_fields=["password"])

    return Response(
        {"detail": "Tu contraseña fue actualizada."}, status=status.HTTP_200_OK
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_frost_alerts(request):
    """Historial de alertas de helada notificadas al usuario."""
    alerts = FrostAlert.objects.filter(user=request.user)[:50]
    return Response(
        FrostAlertSerializer(alerts, many=True).data, status=status.HTTP_200_OK
    )
