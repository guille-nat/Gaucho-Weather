from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from .models import CustomUser, FrostAlert, UserPreferences


class UserSerializer(serializers.ModelSerializer):
    """
    Serializer del modelo User,
    con la creación automática del user preferences por defecto.
    """

    # Asegura que sea obligatorio
    email = serializers.EmailField(required=True)

    class Meta:
        model = CustomUser
        fields = ["id", "username", "email",
                  "password", "last_name", "first_name", "email_verify"]
        read_only_fields = ["id", "email_verify"]
        extra_kwargs = {"password": {"write_only": True}}

    def validate_email(self, value):
        """El email identifica la cuenta para recupero, tiene que ser único."""
        email = value.lower()
        queryset = CustomUser.objects.filter(email__iexact=email)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("Ya existe una cuenta con este email.")
        return email

    def validate_username(self, value):
        username = value.lower()
        queryset = CustomUser.objects.filter(username__iexact=username)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("Este nombre de usuario ya está en uso.")
        return username

    def validate_password(self, value):
        """
        ModelSerializer no aplica AUTH_PASSWORD_VALIDATORS por su cuenta:
        sin esto la API aceptaba contraseñas de un caracter aunque el
        formulario del frontend pidiera ocho.
        """
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    def create(self, validated_data):
        with transaction.atomic():
            # Creamos el usuario
            password = validated_data.pop("password")
            user = CustomUser.objects.create_user(
                username=validated_data["username"],
                last_name=validated_data["last_name"].lower(),
                first_name=validated_data["first_name"].lower(),
                email=validated_data["email"],
                password=password,
            )

            # Verificamos si ya existe UserPreferences
            if not hasattr(user, "preferences"):
                # Si no existe, creamos el UserPreferences por defecto
                UserPreferences.objects.create(user=user)

            return user

    def update(self, instance, validated_data):
        """
        La implementación por defecto de ModelSerializer hace
        setattr(instance, 'password', valor), guardando la contraseña EN TEXTO
        PLANO. Hay que hashearla con set_password.
        """
        password = validated_data.pop("password", None)
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save(update_fields=["password"])
        return user


class UserPreferencesSerializer(serializers.ModelSerializer):
    """
    Serializer del modelo UserPreferences
    """

    class Meta:
        model = UserPreferences
        fields = [
            "id",
            "user",
            "favorite_location",
            "alerts_enabled",
            "preferred_units",
        ]
        read_only_fields = ["id", "user"]

    def validate_favorite_location(self, value):
        """
        El campo es un JSONField libre: sin validar, cualquier estructura
        entraba a la base y después rompía en el frontend.
        """
        if not isinstance(value, list):
            raise serializers.ValidationError(
                "favorite_location debe ser una lista de ubicaciones."
            )
        for index, item in enumerate(value):
            if not isinstance(item, dict):
                raise serializers.ValidationError(
                    f"La ubicación #{index + 1} debe ser un objeto."
                )
            missing = {"lat", "lon", "name"} - set(item)
            if missing:
                raise serializers.ValidationError(
                    f"La ubicación #{index + 1} no tiene: {', '.join(sorted(missing))}."
                )
            try:
                lat = float(item["lat"])
                lon = float(item["lon"])
            except (TypeError, ValueError) as exc:
                raise serializers.ValidationError(
                    f"La ubicación #{index + 1} tiene lat/lon no numéricos."
                ) from exc
            if not -90 <= lat <= 90 or not -180 <= lon <= 180:
                raise serializers.ValidationError(
                    f"La ubicación #{index + 1} tiene coordenadas fuera de rango."
                )
        return value


class PasswordResetRequestSerializer(serializers.Serializer):
    """Pedido de recupero: solo necesita el email."""

    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Confirmación de recupero con el token recibido por mail."""

    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value


class FrostAlertSerializer(serializers.ModelSerializer):
    class Meta:
        model = FrostAlert
        fields = [
            "id",
            "location_name",
            "latitude",
            "longitude",
            "forecast_date",
            "probability",
            "min_temperature",
            "notified_at",
        ]
        read_only_fields = fields
