from django.db import transaction
from rest_framework import viewsets

from apps.accounts.plans import check_limit, rule_ids_within_plan

from .models import AlertRule
from .serializers import AlertRuleSerializer


class AlertRuleViewSet(viewsets.ModelViewSet):
    """The farmer's own alert rules (S6). Another user's rule is a 404."""

    serializer_class = AlertRuleSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return AlertRule.objects.filter(user=self.request.user).select_related("lote")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.request.user.is_authenticated:
            context["within_plan"] = rule_ids_within_plan(self.request.user)
        return context

    def perform_create(self, serializer):
        with transaction.atomic():
            check_limit(self.request.user, "alert_rules")
            serializer.save(user=self.request.user)
        # The new rule was not there when the context was built.
        serializer.context["within_plan"] = rule_ids_within_plan(self.request.user)
