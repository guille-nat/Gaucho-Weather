from django.utils import timezone
from rest_framework import serializers

from apps.accounts import plans
from apps.accounts.models import Plan, PlanChange, PlanRequest, User
from apps.accounts.serializers import PlanNameSerializer
from apps.alerts.models import AlertRule
from apps.lotes.models import Lote
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


# --- backoffice-superadmin S1: the account record -------------------------------------------


class RecordPlanChangeSerializer(serializers.ModelSerializer):
    """One row of the plan history, with who made it and why (staff changes carry both)."""

    from_plan = PlanNameSerializer(read_only=True, allow_null=True)
    to_plan = PlanNameSerializer(read_only=True)
    by = PersonSerializer(read_only=True, allow_null=True)

    class Meta:
        model = PlanChange
        fields = ["id", "at", "from_plan", "to_plan", "reason", "by", "note"]
        read_only_fields = fields


class RecordSubscriptionSerializer(SubscriptionRowSerializer):
    """The account's Mercado Pago subscriptions. No checkout link."""

    class Meta(SubscriptionRowSerializer.Meta):
        fields = [field for field in SubscriptionRowSerializer.Meta.fields if field != "user"]
        read_only_fields = fields


class RecordPaymentSerializer(PaymentRowSerializer):
    """The account's payments. No payload: the provider's answer stays private."""

    class Meta(PaymentRowSerializer.Meta):
        fields = [field for field in PaymentRowSerializer.Meta.fields if field != "user"]
        read_only_fields = fields


class RecordLoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lote
        fields = ["id", "name", "created_at"]
        read_only_fields = fields


class RecordAlertRuleSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="get_variable_display", read_only=True)
    lote = serializers.CharField(source="lote.name", read_only=True)

    class Meta:
        model = AlertRule
        fields = ["id", "variable", "name", "lote", "enabled"]
        read_only_fields = fields


class AccountRecordSerializer(serializers.ModelSerializer):
    """GET /api/backoffice/cuentas/{id}/: everything about one account on one screen.

    Never a password, a checkout link or a provider payload.
    """

    plan = PlanNameSerializer(read_only=True)
    status = serializers.SerializerMethodField()
    plan_changes = RecordPlanChangeSerializer(many=True, read_only=True)
    subscriptions = RecordSubscriptionSerializer(
        source="provider_subscriptions", many=True, read_only=True
    )
    payments = RecordPaymentSerializer(many=True, read_only=True)
    lotes = RecordLoteSerializer(many=True, read_only=True)
    alert_rules = RecordAlertRuleSerializer(many=True, read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "name",
            "email",
            "plan",
            "status",
            "founder_number",
            "plan_expires_at",
            "is_active",
            "is_superuser",
            "date_joined",
            "last_login",
            "plan_changes",
            "subscriptions",
            "payments",
            "lotes",
            "alert_rules",
        ]
        read_only_fields = fields

    def get_status(self, user: User) -> str:
        return plans.membership_status(user)


EMAIL_IN_USE = "Ya hay una cuenta con ese email."


class AccountEditSerializer(serializers.Serializer):
    """PATCH /api/backoffice/cuentas/{id}/: name and/or email, normalized like sign-up."""

    name = serializers.CharField(max_length=150, required=False)
    email = serializers.EmailField(max_length=254, required=False)

    def validate_email(self, value: str) -> str:
        value = value.strip().lower()
        others = User.objects.exclude(pk=self.context["account"].pk)
        if others.filter(email__iexact=value).exists():
            raise serializers.ValidationError(EMAIL_IN_USE)
        return value


TRIAL_NOT_FUTURE = "La fecha tiene que ser futura."


class TrialSerializer(serializers.Serializer):
    """POST /api/backoffice/cuentas/{id}/prueba/ {hasta}: a day after today, Buenos Aires time."""

    hasta = serializers.DateField()

    def validate_hasta(self, value):
        if value <= timezone.localdate():
            raise serializers.ValidationError(TRIAL_NOT_FUTURE)
        return value
