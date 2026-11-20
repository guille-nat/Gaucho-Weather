"""Backoffice reports (backoffice-superadmin S5-S8): read-only figures and CSV exports.

Mounted at /api/backoffice/informes/ by apps.backoffice.urls. Every view requires
`is_superuser` (IsSuperuser), like the rest of the backoffice.

Months are calendar months in Buenos Aires time (settings.TIME_ZONE): the last 12, oldest first,
always 12 entries, a month with nothing in it included as zeros.
"""

import csv
import io
import json
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.db.models import Count, Exists, OuterRef, Subquery, Sum
from django.db.models.functions import TruncMonth
from django.http import Http404, HttpResponse
from django.urls import path
from django.utils import timezone
from rest_framework.response import Response

from apps.accounts import plans
from apps.accounts.models import FounderProgram, Plan, PlanChange, User
from apps.accounts.serializers import PlanNameSerializer
from apps.alerts.models import AlertRule
from apps.lotes.models import Lote
from apps.payments.models import Payment, ProviderSubscription

from .models import BackofficeAction
from .views import STATUS_FILTERS, BackofficeView, account_rows, payments_summary

MONTHS = 12
ACTIVE_WINDOW = timedelta(days=30)


# --- Months ---------------------------------------------------------------------------------


def last_months() -> list[date]:
    """The first day of each of the last 12 calendar months in Buenos Aires, oldest first."""
    today = timezone.localdate()
    year, month = today.year, today.month
    months = []
    for _ in range(MONTHS):
        months.append(date(year, month, 1))
        year, month = (year, month - 1) if month > 1 else (year - 1, 12)
    return months[::-1]


def month_key(day: date) -> str:
    return f"{day.year}-{day.month:02d}"


def window_start(months: list[date]) -> datetime:
    return timezone.make_aware(datetime.combine(months[0], datetime.min.time()))


def per_month(queryset, field: str, months: list[date], total=None) -> dict[str, object]:
    """`{"2026-11": value}` for rows whose `field` falls in the window: a count, or `total`."""
    rows = (
        queryset.filter(**{f"{field}__gte": window_start(months)})
        .annotate(month=TruncMonth(field, tzinfo=timezone.get_current_timezone()))
        .order_by()
        .values("month")
        .annotate(value=total or Count("pk"))
        .values_list("month", "value")
    )
    return {month_key(timezone.localtime(month).date()): value for month, value in rows}


def month_rows(months: list[date], **series: dict[str, object]) -> list[dict]:
    """One dict a month with every series, 0 where a month has nothing."""
    return [
        {"mes": key, **{name: values.get(key, 0) for name, values in series.items()}}
        for key in map(month_key, months)
    ]


def money(value) -> float:
    # A number, like every amount here (REST_FRAMEWORK COERCE_DECIMAL_TO_STRING is False).
    return float(value or Decimal("0"))


# --- S5: revenue ----------------------------------------------------------------------------


class RevenueReportView(BackofficeView):
    def get(self, request):
        months = last_months()
        payments = Payment.objects.all()
        subscriptions = ProviderSubscription.objects.all()
        cashed = per_month(
            payments.filter(status=Payment.Status.APPROVED, currency="ARS"),
            "paid_at",
            months,
            total=Sum("amount"),
        )
        rows = month_rows(
            months,
            cobrado_ars={key: money(value) for key, value in cashed.items()},
            pagos_aprobados=per_month(
                payments.filter(status=Payment.Status.APPROVED), "created_at", months
            ),
            pagos_rechazados=per_month(
                payments.filter(status=Payment.Status.REJECTED), "created_at", months
            ),
            altas=per_month(
                subscriptions.exclude(status=ProviderSubscription.Status.PENDING),
                "created_at",
                months,
            ),
            bajas=per_month(
                subscriptions.filter(
                    status__in=[
                        ProviderSubscription.Status.CANCELLED,
                        ProviderSubscription.Status.PAUSED,
                    ]
                ),
                "ended_at",
                months,
            ),
        )
        # The same figure as the summary's "Ingreso mensual": one rule, one place.
        return Response({"meses": rows, "mrr_ars": payments_summary()["monthly_ars"]})


# --- S6: users ------------------------------------------------------------------------------


def accounts_by_plan() -> list[dict]:
    users = User.objects.all()
    counts = {
        status: dict(
            users.filter(rule)
            .order_by()
            .values("plan_id")
            .annotate(n=Count("pk"))
            .values_list("plan_id", "n")
        )
        for status, rule in STATUS_FILTERS.items()
    }
    rows = []
    for plan in Plan.objects.all():
        by_status = {status: counts[status].get(plan.code, 0) for status in STATUS_FILTERS}
        rows.append(
            {
                "plan": PlanNameSerializer(plan).data,
                **by_status,
                "total": sum(by_status.values()),
            }
        )
    return rows


def trial_conversion() -> dict:
    """Accounts that ever had a trial, and how many of them paid after their first trial."""
    first_trial = (
        PlanChange.objects.filter(user=OuterRef("pk"), reason=PlanChange.Reason.TRIAL)
        .order_by("at")
        .values("at")[:1]
    )
    trials = User.objects.annotate(first_trial=Subquery(first_trial)).filter(
        first_trial__isnull=False
    )
    paid_later = PlanChange.objects.filter(
        user=OuterRef("pk"), reason=PlanChange.Reason.PAYMENT, at__gt=OuterRef("first_trial")
    )
    total = trials.count()
    converted = trials.filter(Exists(paid_later)).count()
    return {
        "pruebas": total,
        "pagaron": converted,
        "porcentaje": round(converted * 100 / total, 1) if total else None,
    }


class UsersReportView(BackofficeView):
    def get(self, request):
        months = last_months()
        program, _ = FounderProgram.objects.get_or_create(pk=1)
        return Response(
            {
                "meses": month_rows(
                    months, altas=per_month(User.objects.all(), "date_joined", months)
                ),
                "por_plan": accounts_by_plan(),
                "conversion": trial_conversion(),
                # Numbers handed out by the program, as FounderProgram.remaining counts them.
                "founders": {
                    "usados": program.next_number - 1,
                    "cupo": program.limit,
                    "libres": program.remaining,
                },
            }
        )


# --- S7: usage ------------------------------------------------------------------------------


class UsageReportView(BackofficeView):
    def get(self, request):
        months = last_months()
        since = timezone.now() - ACTIVE_WINDOW
        return Response(
            {
                "meses": month_rows(
                    months, lotes=per_month(Lote.objects.all(), "created_at", months)
                ),
                "lotes_total": Lote.objects.count(),
                "alertas_activas": AlertRule.objects.filter(enabled=True).count(),
                "usuarios_activos_30_dias": User.objects.filter(last_login__gte=since).count(),
            }
        )


# --- S8: CSV exports ------------------------------------------------------------------------

FORMULA_PREFIXES = ("=", "+", "-", "@")
STATUS_WORDS = {"founder": "Founder", "trial": "En prueba", "active": "Activa"}


def cell(value) -> str:
    """Text for one CSV cell. A spreadsheet runs a cell starting with = + - @ as a formula, so
    those get a leading ' (CSV injection guard)."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "sí" if value else "no"
    if isinstance(value, datetime):
        return timezone.localtime(value).strftime("%Y-%m-%d %H:%M")
    text = str(value)
    return f"'{text}" if text.startswith(FORMULA_PREFIXES) else text


def account_export():
    header = [
        "ID",
        "Nombre",
        "Email",
        "Plan",
        "Estado",
        "Founder n.º",
        "Vence la prueba",
        "Activa",
        "Super admin",
        "Alta",
        "Último ingreso",
        "Lotes",
    ]
    rows = (
        [
            user.pk,
            user.name,
            user.email,
            user.plan.name,
            STATUS_WORDS[plans.membership_status(user)],
            user.founder_number,
            user.plan_expires_at,
            user.is_active,
            user.is_superuser,
            user.date_joined,
            user.last_login,
            user.lotes_count,
        ]
        for user in account_rows()
    )
    return header, rows


def payment_export():
    header = [
        "ID",
        "Cuenta",
        "Email",
        "Pasarela",
        "ID en la pasarela",
        "Suscripción",
        "Monto",
        "Moneda",
        "Estado",
        "Pagado el",
        "Registrado",
    ]
    # Never the payload: the provider's answer stays private (as in the Pagos tab).
    rows = (
        [
            pay.pk,
            pay.user.name,
            pay.user.email,
            pay.get_provider_display(),
            pay.external_id,
            pay.subscription.external_id if pay.subscription else None,
            pay.amount,
            pay.currency,
            pay.get_status_display(),
            pay.paid_at,
            pay.created_at,
        ]
        for pay in Payment.objects.select_related("user", "subscription").order_by(
            "-created_at", "-id"
        )
    )
    return header, rows


def log_export():
    header = [
        "ID",
        "Fecha",
        "Hecho por",
        "Email",
        "Acción",
        "Cuenta",
        "Email de la cuenta",
        "Datos",
    ]
    rows = (
        [
            entry.pk,
            entry.at,
            entry.actor.name if entry.actor else None,
            entry.actor.email if entry.actor else None,
            entry.get_action_display(),
            entry.target_user.name if entry.target_user else None,
            entry.target_user.email if entry.target_user else None,
            json.dumps(entry.payload, ensure_ascii=False, sort_keys=True, default=str),
        ]
        for entry in BackofficeAction.objects.select_related("actor", "target_user")
    )
    return header, rows


EXPORTS = {"cuentas": account_export, "pagos": payment_export, "registro": log_export}


class ExportView(BackofficeView):
    """GET exportar/<cuentas|pagos|registro>.csv: UTF-8 with a BOM, so Excel reads the accents."""

    def get(self, request, name):
        if name not in EXPORTS:
            raise Http404
        header, rows = EXPORTS[name]()
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(header)
        count = 0
        for row in rows:
            writer.writerow([cell(value) for value in row])
            count += 1
        filename = f"{name}.csv"
        # Logged after reading, so a registro export does not list itself.
        BackofficeAction.record(
            request.user, BackofficeAction.Action.EXPORT, None, file=filename, rows=count
        )
        response = HttpResponse(
            "\ufeff" + buffer.getvalue(), content_type="text/csv; charset=utf-8"
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


urlpatterns = [
    path("ingresos/", RevenueReportView.as_view(), name="backoffice-report-revenue"),
    path("usuarios/", UsersReportView.as_view(), name="backoffice-report-users"),
    path("uso/", UsageReportView.as_view(), name="backoffice-report-usage"),
    path("exportar/<str:name>.csv", ExportView.as_view(), name="backoffice-report-export"),
]
