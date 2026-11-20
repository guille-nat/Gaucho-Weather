"""The backoffice API (S4, S7): super admins run accounts, plan requests, prices and payments.

Every view requires `is_superuser` (IsSuperuser), and every write records a BackofficeAction
in the same transaction, so a change and its log row are saved together or not at all.
Plan moves reuse apps.accounts.plans, the same code the Django admin runs.
"""

from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Prefetch, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import APIException, NotFound, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import password_reset, plans
from apps.accounts.models import FounderProgram, Plan, PlanChange, PlanRequest, User
from apps.alerts.models import AlertRule
from apps.payments import price_changes
from apps.payments import services as payment_services
from apps.payments.models import Payment, ProviderSubscription
from apps.payments.providers import get_provider
from apps.payments.providers.base import ProviderError

from .models import BackofficeAction
from .permissions import IsSuperuser
from .serializers import (
    AccountEditSerializer,
    AccountRecordSerializer,
    AccountRowSerializer,
    BackofficeActionSerializer,
    ChangePlanSerializer,
    CourtesySerializer,
    PaymentRowSerializer,
    PlanPriceSerializer,
    PriceChangeSerializer,
    RejectRequestSerializer,
    RequestRowSerializer,
    SubscriptionRowSerializer,
    TrialSerializer,
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


USE_COURTESY = "Para dar un plan pago sin cobrar, usá una cortesía."


class AccountPlanView(BackofficeView):
    """Only down to the free plan (cortesias S4): Básico, or Productor for a founder, whose
    free plan it is. A paid plan for free is a cortesía, with an end date. Moving down ends an
    active cortesía (plans._switch does it)."""

    def post(self, request, pk):
        target = get_object_or_404(User, pk=pk)
        serializer = ChangePlanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        plan = Plan.objects.filter(code=serializer.validated_data["plan"]).first()
        if plan is None:
            raise ValidationError({"detail": plans.NO_SUCH_PLAN})
        note = serializer.validated_data["note"]
        with transaction.atomic():
            locked = locked_account(target.pk)
            try:
                plans.refuse_free_empresa(locked, plan.code)
            except plans.PlanRequestError as exc:
                raise ValidationError({"detail": str(exc)}) from exc
            if plan.code not in (Plan.BASICO, plans.free_plan(locked)):
                raise Refused(USE_COURTESY)
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
        try:
            applied = plans.apply_request(plan_request.pk, request.user)
        except plans.PlanRequestError as exc:
            raise Refused(str(exc)) from exc
        if not applied:
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


class PriceChangeView(BackofficeView):
    """A scheduled peso price for a plan (avisos-cambios S1): POST schedules it and emails the
    subscribers it reaches, DELETE cancels the pending one. Both answer the plan's prices."""

    def post(self, request, code):
        plan = get_object_or_404(Plan, code=code)
        serializer = PriceChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                change = price_changes.schedule(request.user, plan, **serializer.validated_data)
                self.record(request.user, BackofficeAction.Action.PRICE_SCHEDULE, change)
        except payment_services.PaymentRefusal as exc:
            return Response({"detail": exc.detail}, status=exc.status)
        return Response(PlanPriceSerializer(plan).data, status=status.HTTP_201_CREATED)

    def delete(self, request, code):
        plan = get_object_or_404(Plan, code=code)
        try:
            with transaction.atomic():
                change = price_changes.cancel(plan)
                self.record(request.user, BackofficeAction.Action.PRICE_UNSCHEDULE, change)
        except payment_services.PaymentRefusal as exc:
            return Response({"detail": exc.detail}, status=exc.status)
        return Response(PlanPriceSerializer(plan).data)

    @staticmethod
    def record(actor, action, change) -> None:
        BackofficeAction.record(
            actor,
            action,
            plan=change.plan_id,
            price_ars_month=change.price_ars_month,
            effective_on=change.effective_on.isoformat(),
        )


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


# --- backoffice-superadmin S1-S4: the account record and the manual changes ----------------

SELF_REFUSED = "No podés hacer eso con tu propia cuenta."
ACCOUNT_BLOCKED = "La cuenta está bloqueada."
RESET_COOLDOWN = "Ya le mandamos un mail hace menos de 10 minutos. Probá de nuevo más tarde."
FOUNDER_HAS_PRODUCTOR = "La cuenta es founder: ya tiene Productor sin vencimiento."
ALREADY_FOUNDER = "La cuenta ya es founder (n.º {number})."
NOT_FOUNDER = "La cuenta no es founder."
NO_SUBSCRIPTION = "La cuenta no tiene una suscripción con Mercado Pago."
PAYING = "La cuenta tiene una suscripción paga: cancelala primero."
PAID_DAYS = "La cuenta tiene días pagos hasta el {date}: dale la prueba después de esa fecha."


SUPERADMIN_NO_GRANTS = "La cuenta es super admin: no recibe cortesías, pruebas ni founder."


def refuse_if_not_grantable(target: User) -> None:
    """A free plan only goes to a working customer account (cortesias S6): never to a super
    admin (themself or another, who could then return the favour) or a blocked account."""
    if target.is_superuser:
        raise Refused(SUPERADMIN_NO_GRANTS)
    if not target.is_active:
        raise Refused(ACCOUNT_BLOCKED)


def refuse_if_paying(target: User, *, trial: bool) -> None:
    """A trial or a founder grant never leaves a paying account charged without service.

    A running subscription (authorized or paused) keeps charging, and a trial's expiry would
    let expire_trials move a paying account to Básico. A cancelled one still inside its paid
    month ends the plan at its next_payment_at, which would cut a longer trial short; a
    founder is safe there (that end only takes a founder back to Productor).
    """
    open_subs = target.provider_subscriptions.filter(ended_at=None)
    if open_subs.filter(status__in=payment_services.RUNNING).exists():
        raise Refused(PAYING)
    if trial:
        ending = open_subs.filter(status=ProviderSubscription.Status.CANCELLED).first()
        if ending is not None and ending.next_payment_at is not None:
            date = timezone.localtime(ending.next_payment_at).strftime("%d/%m/%Y")
            raise Refused(PAID_DAYS.format(date=date))


EDITABLE_FIELDS = ("name", "email")


class Refused(APIException):
    """A 400 whose detail is shown as is."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "refused"


def account_record(pk: int) -> dict:
    user = get_object_or_404(
        User.objects.select_related("plan").prefetch_related(
            Prefetch(
                "plan_changes",
                queryset=PlanChange.objects.select_related("from_plan", "to_plan", "by"),
            ),
            Prefetch(
                "provider_subscriptions",
                queryset=ProviderSubscription.objects.select_related("plan"),
            ),
            "payments",
            "lotes",
            Prefetch("alert_rules", queryset=AlertRule.objects.select_related("lote")),
        ),
        pk=pk,
    )
    return AccountRecordSerializer(user).data


def locked_account(pk: int) -> User:
    """The account, locked until the surrounding transaction ends. Call inside atomic()."""
    return get_object_or_404(User.objects.select_for_update(), pk=pk)


class AccountRecordView(BackofficeView):
    """GET the record (S1); PATCH name and/or email, logged with only what changed."""

    def get(self, request, pk):
        return Response(account_record(pk))

    def patch(self, request, pk):
        target = get_object_or_404(User, pk=pk)
        serializer = AccountEditSerializer(data=request.data, context={"account": target})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            target = locked_account(pk)
            before, after = {}, {}
            for field in EDITABLE_FIELDS:
                if field in serializer.validated_data:
                    value = serializer.validated_data[field]
                    if value != getattr(target, field):
                        before[field], after[field] = getattr(target, field), value
                        setattr(target, field, value)
            if after:
                target.save(update_fields=list(after))
                BackofficeAction.record(
                    request.user,
                    BackofficeAction.Action.ACCOUNT_UPDATE,
                    target,
                    before=before,
                    after=after,
                )
        return Response(account_record(pk))


class AccountFlagView(BackofficeView):
    """Set boolean fields on an account and log it; a no-op logs nothing (S2).

    `fields` are set to `value`; `action` is what the log calls it. `self_refused` stops a super
    admin from doing it to their own account (blocking or revoking themself).
    """

    fields: tuple[str, ...] = ()
    value: bool = True
    action: str = ""
    self_refused = False

    def post(self, request, pk):
        if self.self_refused and pk == request.user.pk:
            raise Refused(SELF_REFUSED)
        with transaction.atomic():
            target = locked_account(pk)
            changed = [field for field in self.fields if getattr(target, field) != self.value]
            if changed:
                for field in self.fields:
                    setattr(target, field, self.value)
                target.save(update_fields=list(self.fields))
                BackofficeAction.record(request.user, self.action, target)
        return Response(account_record(pk))


class BlockView(AccountFlagView):
    """Django refuses inactive accounts: no login, and an open session stops working.

    (A) A Mercado Pago subscription keeps running: cancelling it is a separate action.
    """

    fields = ("is_active",)
    value = False
    action = BackofficeAction.Action.ACCOUNT_BLOCK
    self_refused = True


class UnblockView(AccountFlagView):
    fields = ("is_active",)
    value = True
    action = BackofficeAction.Action.ACCOUNT_UNBLOCK


class SuperadminGrantView(AccountFlagView):
    """`is_superuser` and `is_staff` move together: the backoffice and the Django admin."""

    fields = ("is_superuser", "is_staff")
    value = True
    action = BackofficeAction.Action.SUPERADMIN_GRANT


class SuperadminRevokeView(AccountFlagView):
    fields = ("is_superuser", "is_staff")
    value = False
    action = BackofficeAction.Action.SUPERADMIN_REVOKE
    self_refused = True


class TooSoon(APIException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_code = "too_soon"


class PasswordResetView(BackofficeView):
    """The same email as "Olvidé mi contraseña", with the same 10-minute cooldown (A)."""

    def post(self, request, pk):
        target = get_object_or_404(User, pk=pk)
        if not target.is_active:
            raise Refused(ACCOUNT_BLOCKED)
        if not password_reset.send_reset_email(target.email):
            raise TooSoon(RESET_COOLDOWN)
        BackofficeAction.record(request.user, BackofficeAction.Action.PASSWORD_RESET, target)
        return Response(account_record(pk))


def end_of_day(day) -> datetime:
    """23:59:59 of `day` in the project's time zone (Buenos Aires)."""
    return timezone.make_aware(datetime.combine(day, time(23, 59, 59)))


class TrialView(BackofficeView):
    """Productor until the end of `hasta`: a new trial, or a longer one (S3).

    The move goes through plans._switch as a staff change (which drops any expiry), and the
    expiry is set right after, in the same transaction and under the same lock.
    """

    def post(self, request, pk):
        get_object_or_404(User, pk=pk)
        serializer = TrialSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        until = serializer.validated_data["hasta"]
        with transaction.atomic():
            target = locked_account(pk)
            refuse_if_not_grantable(target)
            if target.is_founder:
                raise Refused(FOUNDER_HAS_PRODUCTOR)
            refuse_if_paying(target, trial=True)
            from_plan = target.plan_id
            plans._switch(
                target, Plan.PRODUCTOR, PlanChange.Reason.STAFF, timezone.now(), by=request.user
            )
            target.plan_expires_at = end_of_day(until)
            target.save(update_fields=["plan_expires_at"])
            BackofficeAction.record(
                request.user,
                BackofficeAction.Action.TRIAL_GRANT,
                target,
                until=until.isoformat(),
                from_plan=from_plan,
            )
        return Response(account_record(pk))


COURTESY_SELF = "No podés darte una cortesía a vos mismo."
NO_COURTESY = "La cuenta no tiene una cortesía activa."


class CourtesyView(BackofficeView):
    """POST gives a paid plan for free until a date, or changes the active one; DELETE ends it
    now (cortesias S1, S2). Every rule is checked here, under the account's lock."""

    def post(self, request, pk):
        get_object_or_404(User, pk=pk)
        if pk == request.user.pk:
            raise Refused(COURTESY_SELF)
        serializer = CourtesySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        plan, until, reason = (serializer.validated_data[f] for f in ("plan", "hasta", "motivo"))
        with transaction.atomic():
            target = locked_account(pk)
            refuse_if_not_grantable(target)
            if target.is_founder and plan == Plan.PRODUCTOR:
                raise Refused(FOUNDER_HAS_PRODUCTOR)
            refuse_if_paying(target, trial=True)
            try:
                _, from_plan = plans.grant_courtesy(
                    target, plan, end_of_day(until), reason, by=request.user
                )
            except plans.CourtesyError as exc:
                raise Refused(str(exc)) from exc
            BackofficeAction.record(
                request.user,
                BackofficeAction.Action.COURTESY_GRANT,
                target,
                plan=plan,
                until=until.isoformat(),
                reason=reason,
                from_plan=from_plan,
            )
        return Response(account_record(pk))

    def delete(self, request, pk):
        with transaction.atomic():
            target = locked_account(pk)
            revoked = plans.revoke_courtesy(target, by=request.user)
            if revoked is None:
                raise NotFound(NO_COURTESY)
            courtesy, change = revoked
            BackofficeAction.record(
                request.user,
                BackofficeAction.Action.COURTESY_REVOKE,
                target,
                plan=courtesy.plan_id,
                until=timezone.localdate(courtesy.ends_at).isoformat(),
                to_plan=change.to_plan_id,
            )
        return Response(account_record(pk))


class FounderGrantView(BackofficeView):
    """The next founder number and Productor for good (S3).

    Like plans.start_membership, the program row is locked while the number is taken, so two
    grants never share one. (A) It works past the quota: the super admin decides by hand.
    """

    def post(self, request, pk):
        get_object_or_404(User, pk=pk)
        with transaction.atomic():
            program, _ = FounderProgram.objects.select_for_update().get_or_create(pk=1)
            target = locked_account(pk)
            refuse_if_not_grantable(target)
            if target.is_founder:
                raise Refused(ALREADY_FOUNDER.format(number=target.founder_number))
            refuse_if_paying(target, trial=False)
            number = program.next_number
            # A number set by hand in the Django admin is never handed out twice.
            while User.objects.filter(founder_number=number).exists():
                number += 1
            program.next_number = number + 1
            program.save(update_fields=["next_number"])
            from_plan = target.plan_id
            target.founder_number = number
            target.save(update_fields=["founder_number"])
            # A staff change drops any expiry: a trial on Productor becomes Productor for good.
            plans._switch(
                target, Plan.PRODUCTOR, PlanChange.Reason.STAFF, timezone.now(), by=request.user
            )
            BackofficeAction.record(
                request.user,
                BackofficeAction.Action.FOUNDER_GRANT,
                target,
                number=number,
                from_plan=from_plan,
            )
        return Response(account_record(pk))


class FounderRevokeView(BackofficeView):
    """Clears the number. (A) The plan stays, with no expiry: changing it is a separate step."""

    def post(self, request, pk):
        with transaction.atomic():
            target = locked_account(pk)
            if not target.is_founder:
                raise Refused(NOT_FOUNDER)
            number = target.founder_number
            target.founder_number = None
            target.save(update_fields=["founder_number"])
            BackofficeAction.record(
                request.user, BackofficeAction.Action.FOUNDER_REVOKE, target, number=number
            )
        return Response(account_record(pk))


def provider_refusal(exc: payment_services.PaymentRefusal) -> Response:
    if exc.status == status.HTTP_404_NOT_FOUND:
        return Response({"detail": NO_SUBSCRIPTION}, status=exc.status)
    return Response({"detail": exc.detail}, status=exc.status)


def configured_provider(sub: ProviderSubscription):
    provider = get_provider(sub.provider)
    if not provider.is_configured():
        raise payment_services.PaymentRefusal(503, payment_services.NOT_ENABLED)
    return provider


class SubscriptionSyncView(BackofficeView):
    """Ask Mercado Pago again for the latest subscription and its charges (a lost webhook, S4).

    Everything is read first; then the answer is applied with the same functions the webhook
    uses, and logged, in one transaction.
    """

    def post(self, request, pk):
        target = get_object_or_404(User, pk=pk)
        sub = target.provider_subscriptions.order_by("-created_at", "-id").first()
        try:
            if sub is None:
                raise payment_services.PaymentRefusal(404, NO_SUBSCRIPTION)
            provider = configured_provider(sub)
            try:
                remote, charges = payment_services.fetch_subscription_state(provider, sub)
            except ProviderError as exc:
                raise payment_services.PaymentRefusal(502, payment_services.PROVIDER_DOWN) from exc
        except payment_services.PaymentRefusal as exc:
            return provider_refusal(exc)
        before = sub.status
        with transaction.atomic():
            synced = payment_services.sync_subscription(provider.name, remote) or sub
            recorded = [
                payment_services.record_payment(provider.name, charge, sub.external_id)
                for charge in charges
            ]
            BackofficeAction.record(
                request.user,
                BackofficeAction.Action.SUBSCRIPTION_SYNC,
                target,
                subscription=sub.external_id,
                before=before,
                after=synced.status,
                payments=sum(payment is not None for payment in recorded),
            )
        return Response(account_record(pk))


class SubscriptionCancelView(BackofficeView):
    """Cancel at Mercado Pago with payments.services.cancel, like the user's own button (S4)."""

    def post(self, request, pk):
        target = get_object_or_404(User, pk=pk)
        sub = target.provider_subscriptions.filter(
            status__in=payment_services.RUNNING, ended_at=None
        ).first()
        try:
            if sub is None:
                raise payment_services.PaymentRefusal(404, NO_SUBSCRIPTION)
            configured_provider(sub)
            with transaction.atomic():
                cancelled = payment_services.cancel(target)
                BackofficeAction.record(
                    request.user,
                    BackofficeAction.Action.SUBSCRIPTION_CANCEL,
                    target,
                    subscription=cancelled.external_id,
                    before=sub.status,
                    after=cancelled.status,
                )
        except payment_services.PaymentRefusal as exc:
            return provider_refusal(exc)
        return Response(account_record(pk))
