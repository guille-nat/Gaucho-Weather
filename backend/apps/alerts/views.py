from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.plans import PlanLimitExceeded, check_limit, rule_ids_within_plan

from .models import AlertEvent, AlertRule, PushSubscription
from .serializers import (
    AlertEventSerializer,
    AlertRuleSerializer,
    MarkReadSerializer,
    PushEndpointSerializer,
    PushSubscriptionSerializer,
)

INBOX_SIZE = 100


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


class AlertEventListView(APIView):
    """The inbox (S7): the last events, newest first, and how many are unread."""

    def get(self, request):
        events = AlertEvent.objects.filter(user=request.user)
        latest = events.select_related("lote").order_by("-created_at", "-id")[:INBOX_SIZE]
        return Response(
            {
                "results": AlertEventSerializer(latest, many=True).data,
                "unread_count": events.filter(read_at=None).count(),
            }
        )


class MarkReadView(APIView):
    def post(self, request):
        serializer = MarkReadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        unread = AlertEvent.objects.filter(user=request.user, read_at=None)
        if "ids" in serializer.validated_data:
            unread = unread.filter(pk__in=serializer.validated_data["ids"])
        unread.update(read_at=timezone.now())
        return Response(status=status.HTTP_204_NO_CONTENT)


class PushKeyView(APIView):
    """The VAPID public key the browser needs to subscribe."""

    def get(self, request):
        if not (settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY):
            return Response(
                {"detail": "Las notificaciones push todavía no están configuradas."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"public_key": settings.VAPID_PUBLIC_KEY})


class PushSubscriptionView(APIView):
    """Subscribe this browser to push, or unsubscribe it."""

    def post(self, request):
        plan = request.user.plan
        if not plan.allows_push:
            raise PlanLimitExceeded(
                f"Tu plan {plan.name} no incluye notificaciones push. "
                "Mirá los planes para sumar más."
            )
        serializer = PushSubscriptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        # Upsert by endpoint: a shared phone moves the subscription to whoever is signed in.
        _, created = PushSubscription.objects.update_or_create(
            endpoint=data["endpoint"],
            defaults={
                "user": request.user,
                "p256dh": data["keys"]["p256dh"],
                "auth": data["keys"]["auth"],
                "user_agent": request.headers.get("User-Agent", "")[:300],
            },
        )
        return Response(
            {"endpoint": data["endpoint"]},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def delete(self, request):
        serializer = PushEndpointSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        PushSubscription.objects.filter(
            user=request.user, endpoint=serializer.validated_data["endpoint"]
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
