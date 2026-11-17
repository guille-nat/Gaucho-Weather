from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from . import plans
from .models import Plan, PlanChange, PlanRequest, User


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


class PlanNameSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = ["code", "name"]
        read_only_fields = fields


class PlanChangeSerializer(serializers.ModelSerializer):
    from_plan = PlanNameSerializer(read_only=True)
    to_plan = PlanNameSerializer(read_only=True)

    class Meta:
        model = PlanChange
        fields = ["at", "from_plan", "to_plan", "reason"]
        read_only_fields = fields


class PlanRequestSerializer(serializers.ModelSerializer):
    plan = serializers.CharField(source="plan_id", read_only=True, allow_null=True)

    class Meta:
        model = PlanRequest
        fields = ["id", "kind", "plan", "created_at"]
        read_only_fields = fields


class SubscriptionSerializer(serializers.ModelSerializer):
    """GET /api/auth/suscripcion/ (S14)."""

    plan = PlanSerializer(read_only=True)
    status = serializers.SerializerMethodField()
    trial_ends_at = serializers.SerializerMethodField()
    usage = serializers.SerializerMethodField()
    pending_request = serializers.SerializerMethodField()
    history = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "plan",
            "status",
            "founder_number",
            "trial_ends_at",
            "usage",
            "pending_request",
            "history",
        ]
        read_only_fields = fields

    def get_status(self, user: User) -> str:
        return plans.membership_status(user)

    def get_trial_ends_at(self, user: User):
        if plans.membership_status(user) != "trial":
            return None
        return serializers.DateTimeField().to_representation(user.plan_expires_at)

    def get_usage(self, user: User) -> dict[str, int]:
        return vars(plans.usage(user))

    def get_pending_request(self, user: User):
        request = plans.pending_request(user)
        return None if request is None else PlanRequestSerializer(request).data

    def get_history(self, user: User):
        changes = user.plan_changes.select_related("from_plan", "to_plan")
        return PlanChangeSerializer(changes, many=True).data


class PlanRequestCreateSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=PlanRequest.Kind.choices)
    plan = serializers.CharField(max_length=20, required=False, allow_null=True, allow_blank=True)


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

    def update(self, instance, validated_data):
        # Only the fields sent: the alert switches save at once, so two PATCHes can overlap,
        # and a full save() would write the other request's field back with its stale value.
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if validated_data:
            instance.save(update_fields=list(validated_data))
        return instance


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
