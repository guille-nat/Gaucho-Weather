"""The backoffice API (S4, S7): super admins run accounts, plan requests, prices and payments.

Every view requires `is_superuser` (IsSuperuser), and every write records a BackofficeAction
in the same transaction, so a change and its log row are saved together or not at all.
Plan moves reuse apps.accounts.plans, the same code the Django admin runs.
"""

from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import plans
from apps.accounts.models import FounderProgram, Plan, PlanChange, PlanRequest, User
from apps.payments.models import Payment, ProviderSubscription

from .models import BackofficeAction
from .permissions import IsSuperuser
from .serializers import (
    AccountRowSerializer,
    BackofficeActionSerializer,
    ChangePlanSerializer,
    PaymentRowSerializer,
    PlanPriceSerializer,
    RejectRequestSerializer,
    RequestRowSerializer,
    SubscriptionRowSerializer,
)

NEW_ACCOUNTS_WINDOW = timedelta(days=30)
BAD_STATUS = "Estado inválido: usá founder, trial o active."
ALREADY_ON_PLAN = "La cuenta ya está en el plan {name}."
NOT_PENDING = "El pedido ya no está pendiente."
BAD_TIPO = "Tipo inválido: usá pagos o suscripciones."

# The same rule as plans.membership_status, as a filter: a founder number wins over an expiry.
STATUS_FILTERS = {
    "founder": ~Q(founder_number=None),
    "trial": Q(founder_number=None) & ~Q(plan_expires_at=None),
    "active": Q(founder_number=None, plan_expires_at=None),
}


class Conflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "conflict"


class BackofficePagination(PageNumberPagination):
    page_size = 50


class BackofficeView(APIView):
    permission_classes = [IsSuperuser]


class BackofficeListView(generics.ListAPIView):
    permission_classes = [IsSuperuser]
    pagination_class = BackofficePagination


def account_rows():
    return (
        User.objects.select_related("plan")
        .annotate(lotes_count=Count("lotes"))
        .order_by("-date_joined", "-id")
    )


class SummaryView(BackofficeView):
    def get(self, request):
        users = User.objects.all()
        active = dict(
            users.filter(STATUS_FILTERS["active"])
            .values_list("plan_id")
            .annotate(n=Count("id"))
            .values_list("plan_id", "n")
        )
        program, _ = FounderProgram.objects.get_or_create(pk=1)
        since = timezone.now() - NEW_ACCOUNTS_WINDOW
        return Response(
            {
                "accounts": {
                    "total": users.count(),
                    "founders": users.filter(STATUS_FILTERS["founder"]).count(),
                    "trial": users.filter(STATUS_FILTERS["trial"]).count(),
                    "active": {
                        code: active.get(code, 0)
                        for code in Plan.objects.values_list("code", flat=True)
                    },
                },
                "founders_left": program.remaining,
                "pending_requests": PlanRequest.objects.filter(
                    status=PlanRequest.Status.PENDING
                ).count(),
                "new_accounts_last_30_days": users.filter(date_joined__gte=since).count(),
                "payments": payments_summary(),
            }
        )


def payments_summary() -> dict:
    """Revenue in pesos: what authorized subscriptions bill a month, and what came in this
    calendar month (Buenos Aires time). Amounts in other currencies are left out."""
    running = ProviderSubscription.objects.filter(
        status=ProviderSubscription.Status.AUTHORIZED, ended_at=None, currency="ARS"
    )
    month_start = timezone.localtime().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    paid = Payment.objects.filter(
        status=Payment.Status.APPROVED, currency="ARS", paid_at__gte=month_start
    )
    # A number, like every amount here (REST_FRAMEWORK COERCE_DECIMAL_TO_STRING is False).
    month_ars = paid.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    return {
        "active_subscriptions": running.count(),
        "monthly_ars": running.aggregate(total=Sum("amount"))["total"] or 0,
        "month_payments": paid.count(),
        "month_ars": float(month_ars),
    }


class AccountListView(BackofficeListView):
    """?q= searches name and email; ?plan= is a plan code; ?estado= founder, trial or active."""

    serializer_class = AccountRowSerializer

    def get_queryset(self):
        params = self.request.query_params
        rows = account_rows()
        if q := params.get("q", "").strip():
            rows = rows.filter(Q(name__icontains=q) | Q(email__icontains=q))
        if plan := params.get("plan"):
            rows = rows.filter(plan_id=plan)
        if estado := params.get("estado"):
            if estado not in STATUS_FILTERS:
                raise ValidationError({"detail": BAD_STATUS})
            rows = rows.filter(STATUS_FILTERS[estado])
        return rows


class AccountPlanView(BackofficeView):
    def post(self, request, pk):
        target = get_object_or_404(User, pk=pk)
        serializer = ChangePlanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        plan = Plan.objects.filter(code=serializer.validated_data["plan"]).first()
        if plan is None:
            raise ValidationError({"detail": plans.NO_SUCH_PLAN})
        note = serializer.validated_data["note"]
        with transaction.atomic():
            change = plans.change_plan(
                target, plan.code, PlanChange.Reason.STAFF, by=request.user, note=note
            )
            if change is None:
                raise ValidationError({"detail": ALREADY_ON_PLAN.format(name=plan.name)})
            BackofficeAction.record(
                request.user,
                BackofficeAction.Action.PLAN_CHANGE,
                target,
                **{"from": change.from_plan_id, "to": change.to_plan_id, "note": note},
            )
        return Response(AccountRowSerializer(account_rows().get(pk=target.pk)).data)


class RequestListView(BackofficeListView):
    """Pending requests, oldest first: the queue to work through."""

    serializer_class = RequestRowSerializer

    def get_queryset(self):
        return (
            PlanRequest.objects.filter(status=PlanRequest.Status.PENDING)
            .select_related("plan", "user", "user__plan")
            .order_by("created_at", "id")
        )


class ResolveRequestView(BackofficeView):
    """Shared by apply and reject: both call the same plans.* function as the admin action."""

    def resolve(self, request, plan_request: PlanRequest, note: str) -> bool:
        raise NotImplementedError

    def post(self, request, pk):
        plan_request = get_object_or_404(PlanRequest, pk=pk)
        serializer = RejectRequestSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            if not self.resolve(request, plan_request, serializer.validated_data["note"]):
                raise Conflict(NOT_PENDING)
        plan_request.refresh_from_db()
        return Response(RequestRowSerializer(plan_request).data)

    @staticmethod
    def describe(plan_request: PlanRequest) -> dict:
        return {"request": plan_request.pk, "kind": plan_request.kind, "plan": plan_request.plan_id}


class ApplyRequestView(ResolveRequestView):
    def resolve(self, request, plan_request, note):
        if not plans.apply_request(plan_request.pk, request.user):
            return False
        BackofficeAction.record(
            request.user,
            BackofficeAction.Action.REQUEST_APPLY,
            plan_request.user,
            **self.describe(plan_request),
        )
        return True


class RejectRequestView(ResolveRequestView):
    def resolve(self, request, plan_request, note):
        if not plans.reject_request(plan_request.pk, request.user):
            return False
        BackofficeAction.record(
            request.user,
            BackofficeAction.Action.REQUEST_REJECT,
            plan_request.user,
            **self.describe(plan_request),
            note=note,
        )
        return True


PRICE_FIELDS = ("price_ars_month", "price_usd_month")


class PriceListView(BackofficeView):
    def get(self, request):
        return Response(PlanPriceSerializer(Plan.objects.all(), many=True).data)


class PriceDetailView(BackofficeView):
    """The quarterly price update: both prices at once, in pesos and in dollars."""

    def put(self, request, code):
        plan = get_object_or_404(Plan, code=code)
        before = {field: getattr(plan, field) for field in PRICE_FIELDS}
        serializer = PlanPriceSerializer(plan, data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            plan = serializer.save()
            BackofficeAction.record(
                request.user,
                BackofficeAction.Action.PRICE_UPDATE,
                plan=plan.code,
                before=before,
                after={field: getattr(plan, field) for field in PRICE_FIELDS},
            )
        return Response(serializer.data)


class ActionLogView(BackofficeListView):
    serializer_class = BackofficeActionSerializer
    queryset = BackofficeAction.objects.select_related("actor", "target_user")


class PaymentListView(BackofficeListView):
    """Payments (default) or provider subscriptions (`?tipo=suscripciones`), newest first."""

    LISTS = {
        "pagos": (Payment, PaymentRowSerializer),
        "suscripciones": (ProviderSubscription, SubscriptionRowSerializer),
    }

    def list_kind(self):
        kind = self.request.query_params.get("tipo") or "pagos"
        if kind not in self.LISTS:
            raise ValidationError({"detail": BAD_TIPO})
        return self.LISTS[kind]

    def get_serializer_class(self):
        return self.list_kind()[1]

    def get_queryset(self):
        model = self.list_kind()[0]
        related = ["user", "plan"] if model is ProviderSubscription else ["user"]
        return model.objects.select_related(*related).order_by("-created_at", "-id")
