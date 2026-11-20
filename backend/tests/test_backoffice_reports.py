"""S5-S8: backoffice reports and CSV exports (odd/tasks/backoffice-superadmin.md)."""

import csv
import io
from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from rest_framework.test import APIClient

from apps.accounts.models import FounderProgram, PlanChange, User
from apps.alerts.models import AlertRule
from apps.backoffice.models import BackofficeAction
from apps.lotes.models import Lote
from apps.payments.models import Payment, ProviderSubscription

from .conftest import PASSWORD
from .test_lotes import make_lote

pytestmark = pytest.mark.django_db

# 2026-11-16 09:00 in Buenos Aires: the last 12 months run from December 2025 to November 2026.
NOW = datetime(2026, 11, 16, 12, tzinfo=UTC)
MONTHS = ["2025-12"] + [f"2026-{m:02d}" for m in range(1, 12)]
BASE = "/api/backoffice/informes/"
REVENUE = f"{BASE}ingresos/"
USERS = f"{BASE}usuarios/"
USAGE = f"{BASE}uso/"
EXPORTS = [f"{BASE}exportar/{name}.csv" for name in ("cuentas", "pagos", "registro")]
BOM = "\ufeff"


@pytest.fixture(autouse=True)
def _frozen_clock():
    with time_machine.travel(NOW, tick=False):
        yield


def client_for(user):
    client = APIClient()
    client.force_login(user)
    return client


@pytest.fixture
def admin_user(db):
    user = User.objects.create_superuser(email="jefe@example.com", password=PASSWORD, name="Jefe")
    User.objects.filter(pk=user.pk).update(date_joined=datetime(2020, 1, 1, tzinfo=UTC))
    user.refresh_from_db()
    return user


@pytest.fixture
def admin_client(admin_user):
    return client_for(admin_user)


def account(email, name="Ana", **fields):
    user = User.objects.create_user(email=email, password=PASSWORD, name=name)
    fields.setdefault("date_joined", datetime(2020, 1, 1, tzinfo=UTC))
    User.objects.filter(pk=user.pk).update(**fields)
    user.refresh_from_db()
    return user


def at(year, month, day=10, hour=15):
    """A moment in UTC, well inside the Buenos Aires day."""
    return datetime(year, month, day, hour, tzinfo=UTC)


def subscription(user, external_id, status="authorized", currency="ARS", amount=14900, **fields):
    sub = ProviderSubscription.objects.create(
        user=user,
        plan_id="productor",
        provider="mercadopago",
        currency=currency,
        amount=amount,
        external_id=external_id,
        status=status,
        checkout_url="https://mp.example.com/checkout/secreto",
        ended_at=fields.pop("ended_at", None),
    )
    ProviderSubscription.objects.filter(pk=sub.pk).update(**fields)
    return sub


def payment(user, external_id, amount="14900.00", status="approved", currency="ARS", **fields):
    paid_at = fields.pop("paid_at", None)
    created_at = fields.pop("created_at", paid_at or NOW)
    return Payment.objects.create(
        user=user,
        provider="mercadopago",
        external_id=external_id,
        amount=amount,
        currency=currency,
        status=status,
        paid_at=paid_at,
        created_at=created_at,
        payload={"payer": {"email": "secreto@example.com"}, "token": "tok-secreto"},
        **fields,
    )


def month_row(rows, month):
    return next(row for row in rows if row["mes"] == month)


ENDPOINTS = [REVENUE, USERS, USAGE, *EXPORTS]


class TestAccess:
    @pytest.mark.parametrize("path", ENDPOINTS)
    def test_anonymous_is_refused(self, path):
        response = APIClient().get(path)

        assert response.status_code == 403
        assert not BackofficeAction.objects.exists()

    @pytest.mark.parametrize("path", ENDPOINTS)
    def test_a_non_superuser_is_refused(self, path):
        staff_only = account("staff@example.com", is_staff=True)

        response = client_for(staff_only).get(path)

        assert response.status_code == 403
        assert response.json() == {"detail": "Solo los super admins pueden usar el backoffice."}
        assert not BackofficeAction.objects.exists()


class TestRevenue:
    def test_twelve_buenos_aires_months_oldest_first_with_zeros(self, admin_client):
        response = admin_client.get(REVENUE)

        assert response.status_code == 200
        body = response.json()
        assert [row["mes"] for row in body["meses"]] == MONTHS
        assert body["meses"][0] == {
            "mes": "2025-12",
            "cobrado_ars": 0,
            "pagos_aprobados": 0,
            "pagos_rechazados": 0,
            "altas": 0,
            "bajas": 0,
        }
        assert body["mrr_ars"] == 0

    def test_counts_money_payments_and_subscriptions_per_month(self, admin_client):
        ana = account("ana@example.com")
        beto = account("beto@example.com")
        # Approved ARS payments add up by paid_at, in Buenos Aires time.
        payment(ana, "p1", paid_at=at(2026, 9, 5), created_at=at(2026, 9, 5))
        payment(beto, "p2", amount="49900.50", paid_at=at(2026, 9, 20), created_at=at(2026, 9, 20))
        # 2026-11-01 02:00 UTC is still October 31 in Buenos Aires.
        payment(
            ana, "p3", paid_at=datetime(2026, 11, 1, 2, tzinfo=UTC), created_at=at(2026, 10, 30)
        )
        # Registered in October, paid in November: counted in October, cashed in November.
        payment(beto, "p4", paid_at=at(2026, 11, 2), created_at=at(2026, 10, 31))
        # Dollars are left out of the money, but the payment still counts as approved.
        payment(beto, "p5", amount="10.00", currency="USD", paid_at=at(2026, 9, 6))
        payment(ana, "p6", status="rejected", created_at=at(2026, 9, 7))
        payment(ana, "p7", status="rejected", created_at=at(2026, 11, 3))
        payment(ana, "p8", status="pending", created_at=at(2026, 9, 8))
        # Older than the 12 months: ignored.
        payment(ana, "p9", paid_at=at(2025, 11, 20), created_at=at(2025, 11, 20))

        subscription(ana, "s1", created_at=at(2026, 9, 1))
        subscription(beto, "s2", amount=49900, created_at=at(2026, 10, 1))
        # Pending (never paid): not a sign-up, and not in the MRR.
        subscription(beto, "s3", status="pending", created_at=at(2026, 10, 2))
        # In dollars: a sign-up, but not in the MRR.
        subscription(beto, "s4", currency="USD", amount=15, created_at=at(2026, 10, 3))
        # Ended this month: a sign-up in August, a drop in November.
        subscription(
            ana, "s5", status="cancelled", created_at=at(2026, 8, 1), ended_at=at(2026, 11, 4)
        )
        subscription(
            beto, "s6", status="paused", created_at=at(2026, 8, 2), ended_at=at(2026, 11, 5)
        )
        # Authorized but with an end date: not running, so not in the MRR nor a drop.
        subscription(ana, "s7", created_at=at(2026, 8, 3), ended_at=at(2026, 11, 6))

        response = admin_client.get(REVENUE)

        assert response.status_code == 200
        body = response.json()
        rows = body["meses"]
        assert len(rows) == 12
        assert month_row(rows, "2026-09") == {
            "mes": "2026-09",
            "cobrado_ars": 64800.5,
            "pagos_aprobados": 3,
            "pagos_rechazados": 1,
            "altas": 1,
            "bajas": 0,
        }
        assert month_row(rows, "2026-10") == {
            "mes": "2026-10",
            "cobrado_ars": 14900,
            "pagos_aprobados": 2,
            "pagos_rechazados": 0,
            "altas": 2,
            "bajas": 0,
        }
        assert month_row(rows, "2026-11") == {
            "mes": "2026-11",
            "cobrado_ars": 14900,
            "pagos_aprobados": 0,
            "pagos_rechazados": 1,
            "altas": 0,
            "bajas": 2,
        }
        assert month_row(rows, "2026-08")["altas"] == 3
        assert month_row(rows, "2025-12")["cobrado_ars"] == 0
        assert body["mrr_ars"] == 14900 + 49900

    def test_mrr_matches_the_summary(self, admin_client):
        ana = account("ana@example.com")
        subscription(ana, "s1")
        subscription(ana, "s2", amount=49900)
        subscription(ana, "s3", status="pending")

        mrr = admin_client.get(REVENUE).json()["mrr_ars"]

        summary = admin_client.get("/api/backoffice/resumen/").json()
        assert mrr == summary["payments"]["monthly_ars"] == 64800


class TestUsers:
    def test_sign_ups_plans_trial_conversion_and_founders(self, admin_client):
        FounderProgram.objects.filter(pk=1).update(limit=10, next_number=4)
        account("f1@example.com", plan_id="productor", founder_number=1, date_joined=at(2026, 3, 1))
        account("f2@example.com", plan_id="productor", founder_number=2, date_joined=at(2026, 3, 2))
        trial = account(
            "t1@example.com",
            plan_id="productor",
            plan_expires_at=NOW + timedelta(days=9),
            date_joined=at(2026, 11, 2),
        )
        paid = account("p1@example.com", plan_id="productor", date_joined=at(2026, 10, 5))
        account("e1@example.com", plan_id="empresa", date_joined=at(2026, 10, 6))
        # 2026-10-01 02:00 UTC is still September 30 in Buenos Aires.
        account("b1@example.com", date_joined=datetime(2026, 10, 1, 2, tzinfo=UTC))
        account("old@example.com", date_joined=at(2025, 11, 30))
        expired = account("x1@example.com", date_joined=at(2026, 9, 1))

        # Trial users: trial, paid later, and expired (trial then trial_ended, never paid).
        PlanChange.objects.create(
            user=trial,
            from_plan_id="basico",
            to_plan_id="productor",
            reason="trial",
            at=at(2026, 11, 2),
        )
        PlanChange.objects.create(
            user=paid,
            from_plan_id="basico",
            to_plan_id="productor",
            reason="trial",
            at=at(2026, 10, 5),
        )
        PlanChange.objects.create(
            user=paid,
            from_plan_id="productor",
            to_plan_id="productor",
            reason="payment",
            at=at(2026, 10, 30),
        )
        PlanChange.objects.create(
            user=expired,
            from_plan_id="basico",
            to_plan_id="productor",
            reason="trial",
            at=at(2026, 9, 1),
        )
        PlanChange.objects.create(
            user=expired,
            from_plan_id="productor",
            to_plan_id="basico",
            reason="trial_ended",
            at=at(2026, 10, 1),
        )

        response = admin_client.get(USERS)

        assert response.status_code == 200
        body = response.json()
        assert [row["mes"] for row in body["meses"]] == MONTHS
        assert month_row(body["meses"], "2026-03") == {"mes": "2026-03", "altas": 2}
        assert month_row(body["meses"], "2026-09") == {"mes": "2026-09", "altas": 2}
        assert month_row(body["meses"], "2026-10") == {"mes": "2026-10", "altas": 2}
        assert month_row(body["meses"], "2026-11") == {"mes": "2026-11", "altas": 1}
        assert month_row(body["meses"], "2025-12") == {"mes": "2025-12", "altas": 0}
        # admin_user, b1, old and x1 are on Básico.
        assert body["por_plan"] == [
            {
                "plan": {"code": "basico", "name": "Básico"},
                "founder": 0,
                "trial": 0,
                "active": 4,
                "total": 4,
            },
            {
                "plan": {"code": "productor", "name": "Productor"},
                "founder": 2,
                "trial": 1,
                "active": 1,
                "total": 4,
            },
            {
                "plan": {"code": "empresa", "name": "Empresa"},
                "founder": 0,
                "trial": 0,
                "active": 1,
                "total": 1,
            },
        ]
        assert body["conversion"] == {"pruebas": 3, "pagaron": 1, "porcentaje": 33.3}
        assert body["founders"] == {"usados": 3, "cupo": 10, "libres": 7}

    def test_a_payment_before_the_trial_is_not_a_conversion(self, admin_client):
        ana = account("ana@example.com")
        PlanChange.objects.create(
            user=ana,
            from_plan_id="basico",
            to_plan_id="productor",
            reason="payment",
            at=at(2026, 5, 1),
        )
        PlanChange.objects.create(
            user=ana,
            from_plan_id="productor",
            to_plan_id="productor",
            reason="trial",
            at=at(2026, 6, 1),
        )

        body = admin_client.get(USERS).json()

        assert body["conversion"] == {"pruebas": 1, "pagaron": 0, "porcentaje": 0.0}

    def test_no_trials_has_no_percentage(self, admin_client):
        body = admin_client.get(USERS).json()

        assert body["conversion"] == {"pruebas": 0, "pagaron": 0, "porcentaje": None}


class TestUsage:
    def test_lotes_per_month_active_alerts_and_active_users(self, admin_client, admin_user):
        ana = account("ana@example.com", last_login=NOW - timedelta(days=29))
        account("beto@example.com", last_login=NOW - timedelta(days=31))
        account("caro@example.com")
        User.objects.filter(pk=admin_user.pk).update(last_login=NOW - timedelta(hours=1))
        stamps = [at(2026, 2, 3), at(2026, 2, 4), at(2026, 11, 1), at(2024, 5, 1)]
        lotes = []
        for index, stamp in enumerate(stamps):
            lote = make_lote(ana, name=f"Lote {index}")
            Lote.objects.filter(pk=lote.pk).update(created_at=stamp)
            lotes.append(lote)
        AlertRule.objects.create(user=ana, lote=lotes[0], variable="frost")
        AlertRule.objects.create(
            user=ana, lote=lotes[1], variable="rain", comparator="gt", threshold=10
        )
        AlertRule.objects.create(user=ana, lote=lotes[1], variable="wind", enabled=False)

        response = admin_client.get(USAGE)

        assert response.status_code == 200
        body = response.json()
        assert [row["mes"] for row in body["meses"]] == MONTHS
        assert month_row(body["meses"], "2026-02") == {"mes": "2026-02", "lotes": 2}
        assert month_row(body["meses"], "2026-11") == {"mes": "2026-11", "lotes": 1}
        assert month_row(body["meses"], "2026-05") == {"mes": "2026-05", "lotes": 0}
        assert body["lotes_total"] == 4
        assert body["alertas_activas"] == 2
        assert body["usuarios_activos_30_dias"] == 2
        assert set(body) == {"meses", "lotes_total", "alertas_activas", "usuarios_activos_30_dias"}


def read_csv(response):
    text = response.content.decode("utf-8")
    assert text.startswith(BOM)
    return list(csv.reader(io.StringIO(text[len(BOM) :])))


def assert_csv(response, filename):
    assert response.status_code == 200
    assert response["Content-Type"] == "text/csv; charset=utf-8"
    assert response["Content-Disposition"] == f'attachment; filename="{filename}"'


class TestExports:
    def test_accounts(self, admin_client, admin_user):
        evil = account(
            "evil@example.com",
            name='=HYPERLINK("http://x")',
            plan_id="productor",
            plan_expires_at=at(2026, 12, 1),
            date_joined=at(2026, 10, 5),
            last_login=datetime(2026, 11, 1, 2, tzinfo=UTC),
        )
        make_lote(evil)
        account("f@example.com", name="+Founder", plan_id="productor", founder_number=7)
        account("menos@example.com", name="-menos", is_active=False)
        account("arroba@example.com", name="@arroba")

        response = admin_client.get(f"{BASE}exportar/cuentas.csv")

        assert_csv(response, "cuentas.csv")
        rows = read_csv(response)
        assert rows[0] == [
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
        assert len(rows) == 1 + 5
        by_email = {row[2]: row for row in rows[1:]}
        assert by_email["evil@example.com"] == [
            str(evil.pk),
            '\'=HYPERLINK("http://x")',
            "evil@example.com",
            "Productor",
            "En prueba",
            "",
            "2026-12-01 12:00",
            "sí",
            "no",
            "2026-10-05 12:00",
            "2026-10-31 23:00",
            "1",
        ]
        assert by_email["f@example.com"][1] == "'+Founder"
        assert by_email["f@example.com"][4:6] == ["Founder", "7"]
        assert by_email["menos@example.com"][1] == "'-menos"
        assert by_email["menos@example.com"][7] == "no"
        assert by_email["arroba@example.com"][1] == "'@arroba"
        assert by_email["jefe@example.com"][8] == "sí"
        assert "pbkdf2" not in response.content.decode()
        assert "password" not in response.content.decode().lower()

        log = BackofficeAction.objects.get()
        assert log.action == "export"
        assert log.actor == admin_user
        assert log.target_user is None
        assert log.payload == {"file": "cuentas.csv", "rows": 5}

    def test_payments(self, admin_client, admin_user):
        ana = account("ana@example.com", name="Ana")
        sub = subscription(ana, "sub-a")
        approved = payment(
            ana, "p1", paid_at=datetime(2026, 11, 1, 2, tzinfo=UTC), subscription=sub
        )
        rejected = payment(ana, "-p2", status="rejected", created_at=at(2026, 9, 7))

        response = admin_client.get(f"{BASE}exportar/pagos.csv")

        assert_csv(response, "pagos.csv")
        rows = read_csv(response)
        assert rows[0] == [
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
        # Newest first, like the Pagos tab.
        assert rows[1:] == [
            [
                str(approved.pk),
                "Ana",
                "ana@example.com",
                "Mercado Pago",
                "p1",
                "sub-a",
                "14900.00",
                "ARS",
                "aprobado",
                "2026-10-31 23:00",
                "2026-10-31 23:00",
            ],
            [
                str(rejected.pk),
                "Ana",
                "ana@example.com",
                "Mercado Pago",
                "'-p2",
                "",
                "14900.00",
                "ARS",
                "rechazado",
                "",
                "2026-09-07 12:00",
            ],
        ]
        text = response.content.decode()
        assert "secreto" not in text
        assert "tok-" not in text
        assert "checkout" not in text
        assert BackofficeAction.objects.get().payload == {"file": "pagos.csv", "rows": 2}

    def test_log(self, admin_client, admin_user):
        ana = account("ana@example.com", name="Ana")
        BackofficeAction.objects.create(
            actor=admin_user,
            action="plan_change",
            target_user=ana,
            payload={"from": "basico", "to": "empresa", "note": "=1+1"},
            at=at(2026, 11, 3),
        )
        BackofficeAction.objects.create(
            actor=None, action="price_update", payload={"plan": "productor"}, at=at(2026, 11, 4)
        )

        response = admin_client.get(f"{BASE}exportar/registro.csv")

        assert_csv(response, "registro.csv")
        rows = read_csv(response)
        assert rows[0] == [
            "ID",
            "Fecha",
            "Hecho por",
            "Email",
            "Acción",
            "Cuenta",
            "Email de la cuenta",
            "Datos",
        ]
        assert rows[1][1:] == [
            "2026-11-04 12:00",
            "",
            "",
            "precio actualizado",
            "",
            "",
            '{"plan": "productor"}',
        ]
        assert rows[2][1:] == [
            "2026-11-03 12:00",
            "Jefe",
            "jefe@example.com",
            "cambio de plan",
            "Ana",
            "ana@example.com",
            '{"from": "basico", "note": "=1+1", "to": "empresa"}',
        ]
        # The export logs itself after reading, so its own row is not in the file.
        assert len(rows) == 3
        export = BackofficeAction.objects.filter(action="export").get()
        assert export.payload == {"file": "registro.csv", "rows": 2}

    def test_a_formula_in_any_cell_is_neutralized(self, admin_client):
        cmd = account("x@example.com")
        User.objects.filter(pk=cmd.pk).update(email="=cmd@example.com")

        rows = read_csv(admin_client.get(f"{BASE}exportar/cuentas.csv"))

        assert [row[2] for row in rows if "cmd" in row[2]] == ["'=cmd@example.com"]

    def test_an_unknown_file_is_404_and_not_logged(self, admin_client):
        response = admin_client.get(f"{BASE}exportar/claves.csv")

        assert response.status_code == 404
        assert not BackofficeAction.objects.exists()
