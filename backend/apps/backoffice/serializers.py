from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from apps.accounts import plans
from apps.accounts.models import Courtesy, Plan, PlanChange, PlanRequest, User
from apps.accounts.serializers import PlanNameSerializer
from apps.alerts.models import AlertRule
from apps.lotes.models import Lote
from apps.payments import price_changes
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
    """Both prices are required on every PUT: null means "Precio a confirmar", 0 means free.

    `pending_change` is the scheduled peso price (avisos-cambios S4): how many subscriptions it
    reaches and how many notices went out, or null.
    """

    pending_change = serializers.SerializerMethodField()

    class Meta:
        model = Plan
        fields = ["code", "name", "price_ars_month", "price_usd_month", "pending_change"]
        read_only_fields = ["code", "name"]
        extra_kwargs = {
            "price_ars_month": {"required": True, "allow_null": True, "min_value": 0},
            "price_usd_month": {"required": True, "allow_null": True, "min_value": 0},
        }

    def get_pending_change(self, plan: Plan) -> dict | None:
        change = price_changes.pending_change(plan)
        if change is None:
            return None
        return {
            "price_ars_month": change.price_ars_month,
            "effective_on": change.effective_on.isoformat(),
            "notices": change.notices.count(),
            "notices_sent": change.notices.exclude(sent_at=None).count(),
        }


class PriceChangeSerializer(serializers.Serializer):
    """A scheduled peso price (avisos-cambios S1): at least 30 days ahead."""

    price_ars_month = serializers.IntegerField(min_value=1)
    effective_on = serializers.DateField()

    def validate_effective_on(self, value):
        if value < price_changes.earliest_date():
            raise serializers.ValidationError(price_changes.TOO_SOON)
        return value


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


class RecordCourtesySerializer(serializers.ModelSerializer):
    """The account's active cortesía: a paid plan for free until `ends_at` (cortesias S1)."""

    plan = PlanNameSerializer(read_only=True)
    granted_by = PersonSerializer(read_only=True, allow_null=True)

    class Meta:
        model = Courtesy
        fields = ["plan", "starts_at", "ends_at", "reason", "granted_by"]
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
    courtesy = serializers.SerializerMethodField()

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
            "courtesy",
        ]
        read_only_fields = fields

    def get_status(self, user: User) -> str:
        return plans.membership_status(user)

    def get_courtesy(self, user: User) -> dict | None:
        courtesy = (
            user.courtesies.select_related("plan", "granted_by").filter(ended_at=None).first()
        )
        return RecordCourtesySerializer(courtesy).data if courtesy else None


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


TRIAL_TOO_FAR = "La prueba dura como máximo un año: elegí una fecha hasta el {date}."


class TrialSerializer(serializers.Serializer):
    """POST /api/backoffice/cuentas/{id}/prueba/ {hasta}: a day after today and at most a year
    ahead, Buenos Aires time, like a cortesía (cortesias S6)."""

    hasta = serializers.DateField()

    def validate_hasta(self, value):
        today = timezone.localdate()
        if value <= today:
            raise serializers.ValidationError(TRIAL_NOT_FUTURE)
        last = today + timedelta(days=plans.COURTESY_MAX_DAYS)
        if value > last:
            raise serializers.ValidationError(TRIAL_TOO_FAR.format(date=last.strftime("%d/%m/%Y")))
        return value


COURTESY_TOO_FAR = "La cortesía dura como máximo un año: elegí una fecha hasta el {date}."


class CourtesySerializer(serializers.Serializer):
    """POST /api/backoffice/cuentas/{id}/cortesia/ {plan, hasta, motivo} (cortesias S1).

    `hasta` is a day after today and at most a year ahead, Buenos Aires time.
    """

    plan = serializers.ChoiceField(choices=plans.COURTESY_PLANS)
    hasta = serializers.DateField()
    motivo = serializers.CharField(max_length=200)

    def validate_hasta(self, value):
        today = timezone.localdate()
        if value <= today:
            raise serializers.ValidationError(TRIAL_NOT_FUTURE)
        last = today + timedelta(days=plans.COURTESY_MAX_DAYS)
        if value > last:
            raise serializers.ValidationError(
                COURTESY_TOO_FAR.format(date=last.strftime("%d/%m/%Y"))
            )
        return value
