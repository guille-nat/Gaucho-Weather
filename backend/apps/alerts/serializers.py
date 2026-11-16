from rest_framework import serializers

from apps.lotes.models import Lote

from . import rules
from .models import AlertEvent, AlertRule


class OwnLoteField(serializers.PrimaryKeyRelatedField):
    default_error_messages = {
        "does_not_exist": "Elegí uno de tus lotes.",
        "incorrect_type": "Elegí uno de tus lotes.",
    }

    def get_queryset(self):
        return Lote.objects.filter(user=self.context["request"].user)


class AlertRuleSerializer(serializers.ModelSerializer):
    lote = OwnLoteField()
    lote_name = serializers.CharField(source="lote.name", read_only=True)
    threshold = serializers.DecimalField(
        max_digits=5, decimal_places=1, allow_null=True, required=False
    )
    comparator = serializers.ChoiceField(
        choices=AlertRule.Comparator.choices, allow_null=True, required=False
    )
    paused_by_plan = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()

    class Meta:
        model = AlertRule
        fields = [
            "id",
            "lote",
            "lote_name",
            "variable",
            "comparator",
            "threshold",
            "enabled",
            "paused_by_plan",
            "description",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate(self, attrs):
        current = self.instance

        def value(field):
            if field in attrs:
                return attrs[field]
            return getattr(current, field) if current else None

        errors = rules.validation_errors(value("variable"), value("comparator"), value("threshold"))
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def get_paused_by_plan(self, rule: AlertRule) -> bool:
        return rule.pk not in self.context.get("within_plan", {rule.pk})

    def get_description(self, rule: AlertRule) -> str:
        return rules.describe(rule.variable, rule.comparator, rule.threshold, rule.lote.name)


class AlertEventSerializer(serializers.ModelSerializer):
    lote_name = serializers.SerializerMethodField()

    class Meta:
        model = AlertEvent
        fields = [
            "id",
            "title",
            "body",
            "target_date",
            "created_at",
            "read_at",
            "lote",
            "lote_name",
            "data",
        ]
        read_only_fields = fields

    def get_lote_name(self, event: AlertEvent) -> str | None:
        return event.lote.name if event.lote else None


class MarkReadSerializer(serializers.Serializer):
    """No `ids` marks every unread event; a list marks those (own ones only)."""

    ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1), required=False, max_length=500
    )


class PushKeysSerializer(serializers.Serializer):
    p256dh = serializers.CharField(max_length=200)
    auth = serializers.CharField(max_length=100)


class PushSubscriptionSerializer(serializers.Serializer):
    """The browser's PushSubscription.toJSON(): {endpoint, keys: {p256dh, auth}}."""

    endpoint = serializers.URLField(max_length=1000)
    keys = PushKeysSerializer()

    def validate_endpoint(self, value: str) -> str:
        # Push services are always https; anything else is not a browser subscription.
        if not value.startswith("https://"):
            raise serializers.ValidationError("La suscripción push no es válida.")
        return value


class PushEndpointSerializer(serializers.Serializer):
    endpoint = serializers.URLField(max_length=1000)
