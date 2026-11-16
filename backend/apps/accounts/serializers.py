from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from . import plans
from .models import Plan, User


class PlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = [
            "code",
            "name",
            "price_ars_month",
            "max_lotes",
            "max_alert_rules",
            "allows_push",
            "priority_support",
            "highlighted",
        ]
        read_only_fields = fields


class UserSerializer(serializers.ModelSerializer):
    plan = PlanSerializer(read_only=True)
    usage = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "name",
            "plan",
            "plan_expires_at",
            "founder_number",
            "usage",
            "notify_push",
            "notify_email",
        ]
        read_only_fields = fields

    def get_usage(self, user: User) -> dict[str, int]:
        return vars(plans.usage(user))


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(write_only=True, max_length=128, trim_whitespace=False)
    name = serializers.CharField(max_length=150)

    def validate_email(self, value: str) -> str:
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(EMAIL_TAKEN)
        return value

    def validate(self, attrs):
        candidate = User(email=attrs["email"], name=attrs["name"])
        try:
            password_validation.validate_password(attrs["password"], user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from exc
        return attrs

    def create(self, validated_data):
        with transaction.atomic():
            user = User.objects.create_user(**validated_data)
            return plans.start_membership(user)


class LoginSerializer(serializers.Serializer):
    email = serializers.CharField(max_length=254)
    password = serializers.CharField(max_length=128, trim_whitespace=False)


WRONG_PASSWORD = "La contraseña no es correcta."
EMAIL_TAKEN = "Ya existe una cuenta con este email."


class AccountUpdateSerializer(serializers.ModelSerializer):
    """PATCH /api/auth/me/: name, email (with the current password) and notification choices."""

    current_password = serializers.CharField(
        write_only=True, required=False, max_length=128, trim_whitespace=False
    )

    class Meta:
        model = User
        fields = ["name", "email", "notify_push", "notify_email", "current_password"]
        extra_kwargs = {"email": {"validators": []}}  # uniqueness checked case-insensitively below

    def validate_email(self, value: str) -> str:
        return value.strip().lower()

    def validate(self, attrs):
        email = attrs.get("email")
        if email is not None and email != self.instance.email:
            # The password first: without it, nobody learns whether an address has an account.
            password = attrs.get("current_password")
            if not password:
                raise serializers.ValidationError(
                    {"current_password": "Para cambiar el email confirmá tu contraseña."}
                )
            if not self.instance.check_password(password):
                raise serializers.ValidationError({"current_password": WRONG_PASSWORD})
            if User.objects.filter(email__iexact=email).exclude(pk=self.instance.pk).exists():
                raise serializers.ValidationError({"email": EMAIL_TAKEN})
        attrs.pop("current_password", None)
        return attrs


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(max_length=128, trim_whitespace=False)
    new_password = serializers.CharField(max_length=128, trim_whitespace=False)

    def validate_current_password(self, value: str) -> str:
        if not self.context["user"].check_password(value):
            raise serializers.ValidationError(WRONG_PASSWORD)
        return value

    def validate_new_password(self, value: str) -> str:
        try:
            password_validation.validate_password(value, user=self.context["user"])
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value


class DeleteAccountSerializer(serializers.Serializer):
    password = serializers.CharField(max_length=128, trim_whitespace=False)

    def validate_password(self, value: str) -> str:
        if not self.context["user"].check_password(value):
            raise serializers.ValidationError(WRONG_PASSWORD)
        return value


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=64)
    token = serializers.CharField(max_length=128)
    new_password = serializers.CharField(max_length=128, trim_whitespace=False)
