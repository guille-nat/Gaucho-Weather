from rest_framework import serializers

from apps.accounts import plans
from apps.accounts.models import Plan, PlanRequest, User
from apps.accounts.serializers import PlanNameSerializer
from apps.payments.models import Payment, ProviderSubscription
from apps.payments.serializers import ProviderSubscriptionSerializer

from .models import BackofficeAction


class AccountRowSerializer(serializers.ModelSerializer):
    """One row of GET /api/backoffice/cuentas/. `lotes` comes from the queryset's annotation."""

    plan = PlanNameSerializer(read_only=True)
    status = serializers.SerializerMethodField()
    lotes = serializers.IntegerField(source="lotes_count", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "name",
            "email",
            "plan",
            "status",
            "founder_number",
            "lotes",
            "date_joined",
            "last_login",
            "is_superuser",
        ]
        read_only_fields = fields

    def get_status(self, user: User) -> str:
        return plans.membership_status(user)


class RequestUserSerializer(serializers.ModelSerializer):
    plan = PlanNameSerializer(read_only=True)
    status = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "name", "email", "plan", "status"]
        read_only_fields = fields

    def get_status(self, user: User) -> str:
        return plans.membership_status(user)


class RequestRowSerializer(serializers.ModelSerializer):
    plan = PlanNameSerializer(read_only=True)
    user = RequestUserSerializer(read_only=True)

    class Meta:
        model = PlanRequest
        fields = ["id", "kind", "plan", "status", "created_at", "user"]
        read_only_fields = fields


class ChangePlanSerializer(serializers.Serializer):
    plan = serializers.CharField(max_length=20)
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class RejectRequestSerializer(serializers.Serializer):
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class PlanPriceSerializer(serializers.ModelSerializer):
    """Both prices are required on every PUT: null means "Precio a confirmar", 0 means free."""

    class Meta:
        model = Plan
        fields = ["code", "name", "price_ars_month", "price_usd_month"]
        read_only_fields = ["code", "name"]
        extra_kwargs = {
            "price_ars_month": {"required": True, "allow_null": True, "min_value": 0},
            "price_usd_month": {"required": True, "allow_null": True, "min_value": 0},
        }


class PersonSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "name", "email"]
        read_only_fields = fields


class BackofficeActionSerializer(serializers.ModelSerializer):
    actor = PersonSerializer(read_only=True, allow_null=True)
    target_user = PersonSerializer(read_only=True, allow_null=True)

    class Meta:
        model = BackofficeAction
        fields = ["id", "action", "actor", "target_user", "payload", "at"]
        read_only_fields = fields


# --- S7: payments ---------------------------------------------------------------------------


class PayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "name", "email"]
        read_only_fields = fields


class PaymentRowSerializer(serializers.ModelSerializer):
    """One row of GET /api/backoffice/pagos/. No payload: the provider's answer stays private."""

    user = PayerSerializer(read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id",
            "user",
            "provider",
            "external_id",
            "subscription",
            "amount",
            "currency",
            "status",
            "paid_at",
            "created_at",
        ]
        read_only_fields = fields


class SubscriptionRowSerializer(serializers.ModelSerializer):
    """One row of GET /api/backoffice/pagos/?tipo=suscripciones. No checkout link."""

    user = PayerSerializer(read_only=True)
    plan = PlanNameSerializer(read_only=True)
    ends_at = serializers.SerializerMethodField()

    class Meta:
        model = ProviderSubscription
        fields = [
            "id",
            "user",
            "plan",
            "provider",
            "external_id",
            "currency",
            "amount",
            "status",
            "next_payment_at",
            "ends_at",
            "ended_at",
            "created_at",
        ]
        read_only_fields = fields

    get_ends_at = ProviderSubscriptionSerializer.get_ends_at
