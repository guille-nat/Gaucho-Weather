from rest_framework import serializers

from apps.lotes.models import Lote

from . import rules
from .models import AlertRule


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
