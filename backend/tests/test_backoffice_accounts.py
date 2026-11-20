"""S1-S4: the account record and the manual changes of the backoffice.

Spec: odd/tasks/backoffice-superadmin.md. Every Mercado Pago call is mocked with respx.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import httpx
import pytest
import respx
import time_machine
from django.core import mail
from rest_framework.test import APIClient

from apps.accounts import password_reset, plans
from apps.accounts.models import FounderProgram, PlanChange, User
from apps.backoffice.models import BackofficeAction
from apps.payments.models import Payment, ProviderSubscription

from .conftest import PASSWORD
from .test_alert_rules import make_rule
from .test_backoffice import account, client_for
from .test_lotes import make_lote
from .test_payments import API, PREAPPROVAL_ID, SECRET, mp_payment, preapproval

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 11, 16, 12, tzinfo=UTC)
NEXT = NOW + timedelta(days=20)
ACCOUNTS = "/api/backoffice/cuentas/"
SELF_REFUSED = "No podés hacer eso con tu propia cuenta."
NO_SUBSCRIPTION = "La cuenta no tiene una suscripción con Mercado Pago."
PROVIDER_DOWN = "No pudimos conectar con Mercado Pago. Probá de nuevo en un rato."
NOT_ENABLED = "Los pagos todavía no están habilitados."


def url(user, action=""):
    return f"{ACCOUNTS}{user.pk}/{action}"


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(email="jefe@example.com", password=PASSWORD, name="Jefe")


@pytest.fixture
def admin_client(admin_user):
    return client_for(admin_user)


@pytest.fixture
def mp_settings(settings):
    settings.MERCADOPAGO_ACCESS_TOKEN = "TEST-access-token"
    settings.MERCADOPAGO_WEBHOOK_SECRET = SECRET
    settings.MERCADOPAGO_API_URL = API
    return settings


def subscription(user, status="authorized", next_payment_at=NEXT, **fields):
    return ProviderSubscription.objects.create(
        user=user,
        plan_id="productor",
        provider="mercadopago",
        currency="ARS",
        amount=14900,
        external_id=PREAPPROVAL_ID,
        status=status,
        checkout_url="https://www.mercadopago.com.ar/subscriptions/checkout",
        next_payment_at=next_payment_at,
        **fields,
    )


def only_action():
    return BackofficeAction.objects.get()


# Every new endpoint with the method and body that reaches it.
ENDPOINTS = [
    ("get", "", None),
    ("patch", "", {"name": "Otra"}),
    ("post", "bloquear/", {}),
    ("post", "desbloquear/", {}),
    ("post", "superadmin/dar/", {}),
    ("post", "superadmin/quitar/", {}),
    ("post", "restablecer-contrasena/", {}),
    ("post", "prueba/", {"hasta": "2030-01-01"}),
    ("post", "founder/dar/", {}),
    ("post", "founder/quitar/", {}),
    ("post", "suscripcion/sincronizar/", {}),
    ("post", "suscripcion/cancelar/", {}),
]


class TestAccess:
    @pytest.mark.parametrize(("method", "action", "body"), ENDPOINTS)
    def test_a_non_superuser_is_refused(self, method, action, body):
        target = account("ana@example.com")
        staff_only = account("staff@example.com", is_staff=True)

        response = getattr(client_for(staff_only), method)(url(target, action), body, format="json")

        assert response.status_code == 403
        assert response.json() == {"detail": "Solo los super admins pueden usar el backoffice."}
        target.refresh_from_db()
        assert (target.name, target.is_active, target.is_superuser) == ("Ana", True, False)
        assert (target.plan_id, target.founder_number) == ("basico", None)
        assert not BackofficeAction.objects.exists()
        assert not mail.outbox

    @pytest.mark.parametrize(("method", "action", "body"), ENDPOINTS)
    def test_anonymous_is_refused(self, method, action, body):
        target = account("ana@example.com")

        response = getattr(APIClient(), method)(url(target, action), body, format="json")

        assert response.status_code == 403
        assert not BackofficeAction.objects.exists()

    @pytest.mark.parametrize(("method", "action", "body"), ENDPOINTS)
    def test_an_unknown_account_is_a_404(self, admin_client, method, action, body):
        response = getattr(admin_client, method)(f"{ACCOUNTS}999999/{action}", body, format="json")

        assert response.status_code == 404
        assert not BackofficeAction.objects.exists()


# --- S1: the account record ----------------------------------------------------------------


class TestRecord:
    @time_machine.travel(NOW, tick=False)
    def test_returns_everything_about_one_account(self, admin_client, admin_user):
        ana = account(
            "ana@example.com",
            name="Ana",
            plan_id="productor",
            plan_expires_at=NOW + timedelta(days=9),
            last_login=NOW - timedelta(hours=3),
        )
        PlanChange.objects.create(
            user=ana, to_plan_id="productor", reason="trial", at=NOW - timedelta(days=21)
        )
        PlanChange.objects.create(
            user=ana,
            from_plan_id="productor",
            to_plan_id="productor",
            reason="staff",
            at=NOW - timedelta(days=1),
            by=admin_user,
            note="extendida",
        )
        sub = subscription(ana)
        Payment.objects.create(
            user=ana,
            subscription=sub,
            provider="mercadopago",
            external_id="9001",
            amount=Decimal("14900.00"),
            currency="ARS",
            status="approved",
            paid_at=NOW,
            payload={"payer": {"email": "secreto@example.com"}},
        )
        lote = make_lote(ana, name="La Loma")
        make_rule(ana, lote, variable="frost", comparator=None, threshold=None, enabled=False)

        response = admin_client.get(url(ana))

        assert response.status_code == 200
        body = response.json()
        assert {key: body[key] for key in body if key not in RECORD_LISTS} == {
            "id": ana.pk,
            "name": "Ana",
            "email": "ana@example.com",
            "plan": {"code": "productor", "name": "Productor"},
            "status": "trial",
            "founder_number": None,
            "plan_expires_at": "2026-11-25T09:00:00-03:00",
            "is_active": True,
            "is_superuser": False,
            "date_joined": body["date_joined"],
            "last_login": "2026-11-16T06:00:00-03:00",
        }
        assert [change["note"] for change in body["plan_changes"]] == ["extendida", ""]
        assert body["plan_changes"][0] == {
            "id": body["plan_changes"][0]["id"],
            "at": "2026-11-15T09:00:00-03:00",
            "from_plan": {"code": "productor", "name": "Productor"},
            "to_plan": {"code": "productor", "name": "Productor"},
            "reason": "staff",
            "by": {"id": admin_user.pk, "name": "Jefe", "email": "jefe@example.com"},
            "note": "extendida",
        }
        assert body["plan_changes"][1]["from_plan"] is None
        assert body["plan_changes"][1]["by"] is None
        assert body["subscriptions"] == [
            {
                "id": sub.pk,
                "plan": {"code": "productor", "name": "Productor"},
                "provider": "mercadopago",
                "external_id": PREAPPROVAL_ID,
                "currency": "ARS",
                "amount": 14900,
                "status": "authorized",
                "next_payment_at": "2026-12-06T09:00:00-03:00",
                "ends_at": None,
                "ended_at": None,
                "created_at": body["subscriptions"][0]["created_at"],
            }
        ]
        [paid] = body["payments"]
        assert paid == {
            "id": paid["id"],
            "provider": "mercadopago",
            "external_id": "9001",
            "subscription": sub.pk,
            "amount": 14900,
            "currency": "ARS",
            "status": "approved",
            "paid_at": "2026-11-16T09:00:00-03:00",
            "created_at": paid["created_at"],
        }
        assert body["lotes"] == [
            {"id": lote.pk, "name": "La Loma", "created_at": body["lotes"][0]["created_at"]}
        ]
        assert body["alert_rules"] == [
            {
                "id": body["alert_rules"][0]["id"],
                "variable": "frost",
                "name": "Helada en el suelo",
                "lote": "La Loma",
                "enabled": False,
            }
        ]

    def test_never_shows_secrets(self, admin_client):
        ana = account("ana@example.com")
        subscription(ana)

        text = admin_client.get(url(ana)).content.decode()

        for secret in ("checkout_url", "payload", "password", "secreto", "pbkdf2"):
            assert secret not in text

    def test_reads_nothing_into_the_log(self, admin_client):
        admin_client.get(url(account("ana@example.com")))

        assert not BackofficeAction.objects.exists()


RECORD_LISTS = {"plan_changes", "subscriptions", "payments", "lotes", "alert_rules"}


class TestEdit:
    def test_changes_name_and_email_and_logs_only_what_changed(self, admin_client, admin_user):
        ana = account("ana@example.com", name="Ana")

        response = admin_client.patch(
            url(ana), {"name": " Ana María ", "email": "  Ana.M@Campo.COM "}, format="json"
        )

        assert response.status_code == 200
        assert (response.json()["name"], response.json()["email"]) == (
            "Ana María",
            "ana.m@campo.com",
        )
        ana.refresh_from_db()
        assert (ana.name, ana.email) == ("Ana María", "ana.m@campo.com")
        action = only_action()
        assert (action.actor, action.action, action.target_user) == (
            admin_user,
            "account_update",
            ana,
        )
        assert action.payload == {
            "before": {"name": "Ana", "email": "ana@example.com"},
            "after": {"name": "Ana María", "email": "ana.m@campo.com"},
        }

    def test_logs_only_the_changed_field(self, admin_client):
        ana = account("ana@example.com", name="Ana")

        admin_client.patch(url(ana), {"name": "Ana", "email": "nueva@example.com"}, format="json")

        assert only_action().payload == {
            "before": {"email": "ana@example.com"},
            "after": {"email": "nueva@example.com"},
        }

    def test_nothing_changed_logs_nothing(self, admin_client):
        ana = account("ana@example.com", name="Ana")

        response = admin_client.patch(url(ana), {"email": "ANA@example.com"}, format="json")

        assert response.status_code == 200
        assert not BackofficeAction.objects.exists()

    def test_an_email_another_account_uses_is_a_400(self, admin_client):
        ana = account("ana@example.com")
        account("beto@example.com")

        response = admin_client.patch(url(ana), {"email": "BETO@Example.com"}, format="json")

        assert response.status_code == 400
        assert response.json() == {"email": ["Ya hay una cuenta con ese email."]}
        ana.refresh_from_db()
        assert ana.email == "ana@example.com"
        assert not BackofficeAction.objects.exists()

    def test_an_invalid_email_or_empty_name_is_a_400(self, admin_client):
        ana = account("ana@example.com")

        response = admin_client.patch(url(ana), {"email": "no-es-mail", "name": " "}, format="json")

        assert response.status_code == 400
        assert set(response.json()) == {"email", "name"}
        assert not BackofficeAction.objects.exists()


# --- S2: access control --------------------------------------------------------------------


class TestBlock:
    def test_blocks_and_logs_and_the_open_session_stops_working(self, admin_client, admin_user):
        ana = account("ana@example.com")
        ana_session = client_for(ana)
        assert ana_session.get("/api/auth/me/").status_code == 200

        response = admin_client.post(url(ana, "bloquear/"), format="json")

        assert response.status_code == 200
        assert response.json()["is_active"] is False
        ana.refresh_from_db()
        assert ana.is_active is False
        action = only_action()
        assert (action.actor, action.action, action.target_user, action.payload) == (
            admin_user,
            "account_block",
            ana,
            {},
        )
        assert ana_session.get("/api/auth/me/").status_code == 403
        login = APIClient().post(
            "/api/auth/login/", {"email": "ana@example.com", "password": PASSWORD}, format="json"
        )
        assert login.status_code == 400

    def test_blocking_keeps_the_mercadopago_subscription(self, admin_client):
        ana = account("ana@example.com")
        sub = subscription(ana)

        admin_client.post(url(ana, "bloquear/"), format="json")

        sub.refresh_from_db()
        assert sub.status == "authorized"

    def test_unblocks_and_logs(self, admin_client):
        ana = account("ana@example.com", is_active=False)

        response = admin_client.post(url(ana, "desbloquear/"), format="json")

        assert response.status_code == 200
        ana.refresh_from_db()
        assert ana.is_active is True
        assert only_action().action == "account_unblock"
        login = APIClient().post(
            "/api/auth/login/", {"email": "ana@example.com", "password": PASSWORD}, format="json"
        )
        assert login.status_code == 200

    def test_blocking_twice_logs_once(self, admin_client):
        ana = account("ana@example.com", is_active=False)

        response = admin_client.post(url(ana, "bloquear/"), format="json")

        assert response.status_code == 200
        assert not BackofficeAction.objects.exists()

    def test_a_super_admin_cannot_block_themself(self, admin_client, admin_user):
        response = admin_client.post(url(admin_user, "bloquear/"), format="json")

        assert response.status_code == 400
        assert response.json() == {"detail": SELF_REFUSED}
        admin_user.refresh_from_db()
        assert admin_user.is_active is True
        assert not BackofficeAction.objects.exists()


class TestSuperadmin:
    def test_grants_superuser_and_staff_together(self, admin_client, admin_user):
        ana = account("ana@example.com")

        response = admin_client.post(url(ana, "superadmin/dar/"), format="json")

        assert response.status_code == 200
        assert response.json()["is_superuser"] is True
        ana.refresh_from_db()
        assert (ana.is_superuser, ana.is_staff) == (True, True)
        action = only_action()
        assert (action.actor, action.action, action.target_user) == (
            admin_user,
            "superadmin_grant",
            ana,
        )
        assert client_for(ana).get("/api/backoffice/resumen/").status_code == 200

    def test_revokes_both(self, admin_client):
        ana = account("ana@example.com", is_superuser=True, is_staff=True)

        response = admin_client.post(url(ana, "superadmin/quitar/"), format="json")

        assert response.status_code == 200
        ana.refresh_from_db()
        assert (ana.is_superuser, ana.is_staff) == (False, False)
        assert only_action().action == "superadmin_revoke"
        assert client_for(ana).get("/api/backoffice/resumen/").status_code == 403

    def test_a_super_admin_cannot_revoke_themself(self, admin_client, admin_user):
        response = admin_client.post(url(admin_user, "superadmin/quitar/"), format="json")

        assert response.status_code == 400
        assert response.json() == {"detail": SELF_REFUSED}
        admin_user.refresh_from_db()
        assert (admin_user.is_superuser, admin_user.is_staff) == (True, True)
        assert not BackofficeAction.objects.exists()


class TestPasswordReset:
    def test_sends_the_reset_email_and_logs_it(
        self, admin_client, admin_user, monkeypatch, settings
    ):
        ana = account("ana@example.com", name="Ana")
        calls = []
        real = password_reset.send_reset_email

        def spy(email):
            calls.append(email)
            return real(email)

        monkeypatch.setattr(password_reset, "send_reset_email", spy)

        response = admin_client.post(url(ana, "restablecer-contrasena/"), format="json")

        assert response.status_code == 200
        assert calls == ["ana@example.com"]
        [sent] = mail.outbox
        assert sent.to == ["ana@example.com"]
        assert sent.subject == "Restablecé tu contraseña de Gaucho Weather"
        assert f"{settings.PUBLIC_APP_URL}/restablecer/" in sent.body
        action = only_action()
        assert (action.actor, action.action, action.target_user, action.payload) == (
            admin_user,
            "password_reset",
            ana,
            {},
        )

    def test_a_blocked_account_is_a_400(self, admin_client):
        ana = account("ana@example.com", is_active=False)

        response = admin_client.post(url(ana, "restablecer-contrasena/"), format="json")

        assert response.status_code == 400
        assert response.json() == {"detail": "La cuenta está bloqueada."}
        assert not mail.outbox
        assert not BackofficeAction.objects.exists()

    def test_a_second_email_within_the_cooldown_is_a_429(self, admin_client):
        ana = account("ana@example.com")
        admin_client.post(url(ana, "restablecer-contrasena/"), format="json")

        response = admin_client.post(url(ana, "restablecer-contrasena/"), format="json")

        assert response.status_code == 429
        assert response.json() == {
            "detail": "Ya le mandamos un mail hace menos de 10 minutos. Probá de nuevo más tarde."
        }
        assert len(mail.outbox) == 1
        assert BackofficeAction.objects.count() == 1


# --- S3: plan and founder by hand ----------------------------------------------------------


class TestTrial:
    @pytest.fixture(autouse=True)
    def _frozen(self):
        with time_machine.travel(NOW, tick=False):
            yield

    def test_grants_productor_until_the_end_of_that_day(self, admin_client, admin_user):
        ana = account("ana@example.com")

        response = admin_client.post(url(ana, "prueba/"), {"hasta": "2026-12-01"}, format="json")

        assert response.status_code == 200
        body = response.json()
        assert (body["plan"]["code"], body["status"]) == ("productor", "trial")
        assert body["plan_expires_at"] == "2026-12-01T23:59:59-03:00"
        ana.refresh_from_db()
        assert ana.plan_id == "productor"
        assert ana.plan_expires_at == datetime(2026, 12, 2, 2, 59, 59, tzinfo=UTC)
        change = PlanChange.objects.get(user=ana)
        assert (change.from_plan_id, change.to_plan_id, change.reason, change.by) == (
            "basico",
            "productor",
            "staff",
            admin_user,
        )
        action = only_action()
        assert (action.actor, action.action, action.target_user) == (
            admin_user,
            "trial_grant",
            ana,
        )
        assert action.payload == {"until": "2026-12-01", "from_plan": "basico"}

    def test_extends_a_running_trial(self, admin_client):
        ana = account("ana@example.com", plan_id="productor", plan_expires_at=NOW)

        response = admin_client.post(url(ana, "prueba/"), {"hasta": "2027-01-10"}, format="json")

        assert response.status_code == 200
        ana.refresh_from_db()
        assert ana.plan_expires_at == datetime(2027, 1, 11, 2, 59, 59, tzinfo=UTC)
        assert only_action().payload == {"until": "2027-01-10", "from_plan": "productor"}

    def test_goes_through_the_shared_plan_switch(self, admin_client, admin_user, monkeypatch):
        ana = account("ana@example.com")
        calls = []
        real = plans._switch

        def spy(user, plan_code, reason, now, by=None, note=""):
            calls.append((user.pk, plan_code, reason, by))
            return real(user, plan_code, reason, now, by=by, note=note)

        monkeypatch.setattr(plans, "_switch", spy)

        admin_client.post(url(ana, "prueba/"), {"hasta": "2026-12-01"}, format="json")

        assert calls == [(ana.pk, "productor", "staff", admin_user)]

    @pytest.mark.parametrize("hasta", ["2026-11-15", "2026-11-16"])
    def test_a_date_that_is_not_future_is_a_400(self, admin_client, hasta):
        ana = account("ana@example.com")

        response = admin_client.post(url(ana, "prueba/"), {"hasta": hasta}, format="json")

        assert response.status_code == 400
        assert response.json() == {"hasta": ["La fecha tiene que ser futura."]}
        ana.refresh_from_db()
        assert (ana.plan_id, ana.plan_expires_at) == ("basico", None)
        assert not BackofficeAction.objects.exists()

    def test_a_missing_date_is_a_400(self, admin_client):
        response = admin_client.post(url(account("ana@example.com"), "prueba/"), {}, format="json")

        assert response.status_code == 400
        assert "hasta" in response.json()

    def test_a_founder_is_a_400(self, admin_client):
        ana = account("ana@example.com", plan_id="productor", founder_number=3)

        response = admin_client.post(url(ana, "prueba/"), {"hasta": "2026-12-01"}, format="json")

        assert response.status_code == 400
        assert response.json() == {
            "detail": "La cuenta es founder: ya tiene Productor sin vencimiento."
        }
        ana.refresh_from_db()
        assert ana.plan_expires_at is None
        assert not PlanChange.objects.exists()
        assert not BackofficeAction.objects.exists()


class TestFounder:
    def test_grants_the_next_number_and_productor_for_good(self, admin_client, admin_user):
        FounderProgram.objects.filter(pk=1).update(limit=100, next_number=8)
        ana = account("ana@example.com", plan_id="productor", plan_expires_at=NOW)

        response = admin_client.post(url(ana, "founder/dar/"), format="json")

        assert response.status_code == 200
        body = response.json()
        assert (body["founder_number"], body["status"], body["plan_expires_at"]) == (
            8,
            "founder",
            None,
        )
        ana.refresh_from_db()
        assert (ana.founder_number, ana.plan_id, ana.plan_expires_at) == (8, "productor", None)
        assert FounderProgram.objects.get(pk=1).next_number == 9
        change = PlanChange.objects.get(user=ana)
        assert (change.reason, change.by) == ("staff", admin_user)
        action = only_action()
        assert (action.actor, action.action, action.target_user) == (
            admin_user,
            "founder_grant",
            ana,
        )
        assert action.payload == {"number": 8, "from_plan": "productor"}

    def test_moves_a_basico_account_to_productor(self, admin_client):
        FounderProgram.objects.filter(pk=1).update(next_number=1)
        ana = account("ana@example.com")

        admin_client.post(url(ana, "founder/dar/"), format="json")

        ana.refresh_from_db()
        assert (ana.founder_number, ana.plan_id) == (1, "productor")
        assert PlanChange.objects.get(user=ana).from_plan_id == "basico"

    def test_works_when_the_quota_is_used_up(self, admin_client):
        FounderProgram.objects.filter(pk=1).update(limit=5, next_number=6)
        ana = account("ana@example.com")

        response = admin_client.post(url(ana, "founder/dar/"), format="json")

        assert response.status_code == 200
        ana.refresh_from_db()
        assert ana.founder_number == 6
        program = FounderProgram.objects.get(pk=1)
        assert (program.next_number, program.remaining) == (7, 0)

    def test_skips_a_number_already_taken(self, admin_client):
        FounderProgram.objects.filter(pk=1).update(next_number=4)
        account("otro@example.com", plan_id="productor", founder_number=4)
        ana = account("ana@example.com")

        admin_client.post(url(ana, "founder/dar/"), format="json")

        ana.refresh_from_db()
        assert ana.founder_number == 5
        assert FounderProgram.objects.get(pk=1).next_number == 6

    def test_an_account_already_founder_is_a_400(self, admin_client):
        FounderProgram.objects.filter(pk=1).update(next_number=8)
        ana = account("ana@example.com", plan_id="productor", founder_number=3)

        response = admin_client.post(url(ana, "founder/dar/"), format="json")

        assert response.status_code == 400
        assert response.json() == {"detail": "La cuenta ya es founder (n.º 3)."}
        assert FounderProgram.objects.get(pk=1).next_number == 8
        assert not BackofficeAction.objects.exists()

    def test_revokes_the_number_and_keeps_the_plan(self, admin_client, admin_user):
        ana = account("ana@example.com", plan_id="productor", founder_number=3)

        response = admin_client.post(url(ana, "founder/quitar/"), format="json")

        assert response.status_code == 200
        assert response.json()["status"] == "active"
        ana.refresh_from_db()
        assert (ana.founder_number, ana.plan_id, ana.plan_expires_at) == (None, "productor", None)
        assert not PlanChange.objects.exists()
        action = only_action()
        assert (action.actor, action.action, action.target_user, action.payload) == (
            admin_user,
            "founder_revoke",
            ana,
            {"number": 3},
        )

    def test_revoking_a_non_founder_is_a_400(self, admin_client):
        ana = account("ana@example.com")

        response = admin_client.post(url(ana, "founder/quitar/"), format="json")

        assert response.status_code == 400
        assert response.json() == {"detail": "La cuenta no es founder."}
        assert not BackofficeAction.objects.exists()


# --- S4: Mercado Pago from the panel -------------------------------------------------------

SEARCH = f"{API}/authorized_payments/search"


def charges(*payment_ids):
    """`/authorized_payments/search`: one row per charge; a scheduled one has no payment yet."""
    return {
        "paging": {"total": len(payment_ids), "offset": 0, "limit": 30},
        "results": [
            {
                "id": 7000 + index,
                "preapproval_id": PREAPPROVAL_ID,
                "status": "processed" if payment_id else "scheduled",
                "payment": {"id": int(payment_id), "status": "approved"} if payment_id else None,
            }
            for index, payment_id in enumerate(payment_ids)
        ],
    }


@pytest.mark.usefixtures("mp_settings")
class TestSync:
    @respx.mock
    @time_machine.travel(NOW, tick=False)
    def test_applies_the_remote_state_and_records_its_charges(self, admin_client, admin_user):
        ana = account("ana@example.com")
        sub = subscription(ana, status="pending", next_payment_at=None)
        respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
            return_value=httpx.Response(200, json=preapproval("authorized", next_payment=NEXT))
        )
        search = respx.get(SEARCH, params={"preapproval_id": PREAPPROVAL_ID}).mock(
            return_value=httpx.Response(200, json=charges("9001", None))
        )
        respx.get(f"{API}/v1/payments/9001").mock(
            return_value=httpx.Response(200, json=mp_payment())
        )

        response = admin_client.post(url(ana, "suscripcion/sincronizar/"), format="json")

        assert response.status_code == 200
        assert response.json()["subscriptions"][0]["status"] == "authorized"
        assert search.call_count == 1
        sub.refresh_from_db()
        assert (sub.status, sub.next_payment_at) == ("authorized", NEXT)
        ana.refresh_from_db()
        assert ana.plan_id == "productor"
        assert PlanChange.objects.get(user=ana).reason == "payment"
        payment = Payment.objects.get()
        assert (payment.external_id, payment.subscription, payment.status) == (
            "9001",
            sub,
            "approved",
        )
        assert "payer" not in payment.payload
        action = only_action()
        assert (action.actor, action.action, action.target_user) == (
            admin_user,
            "subscription_sync",
            ana,
        )
        assert action.payload == {
            "subscription": PREAPPROVAL_ID,
            "before": "pending",
            "after": "authorized",
            "payments": 1,
        }

    @respx.mock
    def test_syncs_the_latest_subscription(self, admin_client):
        ana = account("ana@example.com")
        old = subscription(ana, status="cancelled", ended_at=NOW)
        ProviderSubscription.objects.filter(pk=old.pk).update(
            external_id="old-one", created_at=NOW - timedelta(days=60)
        )
        subscription(ana, status="authorized")
        latest = respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
            return_value=httpx.Response(200, json=preapproval("authorized"))
        )
        respx.get(SEARCH).mock(return_value=httpx.Response(200, json=charges()))

        response = admin_client.post(url(ana, "suscripcion/sincronizar/"), format="json")

        assert response.status_code == 200
        assert latest.call_count == 1
        assert only_action().payload["payments"] == 0

    @respx.mock
    def test_no_subscription_is_a_404(self, admin_client):
        ana = account("ana@example.com")
        route = respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}")

        response = admin_client.post(url(ana, "suscripcion/sincronizar/"), format="json")

        assert response.status_code == 404
        assert response.json() == {"detail": NO_SUBSCRIPTION}
        assert not route.called
        assert not BackofficeAction.objects.exists()

    @respx.mock
    @pytest.mark.parametrize("failing", ["preapproval", "search", "payment"])
    def test_a_provider_error_is_a_502_and_changes_nothing(self, admin_client, failing):
        ana = account("ana@example.com")
        sub = subscription(ana, status="pending", next_payment_at=None)
        respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
            return_value=httpx.Response(500)
            if failing == "preapproval"
            else httpx.Response(200, json=preapproval("authorized"))
        )
        respx.get(SEARCH).mock(
            return_value=httpx.Response(500)
            if failing == "search"
            else httpx.Response(200, json=charges("9001"))
        )
        respx.get(f"{API}/v1/payments/9001").mock(return_value=httpx.Response(500))

        response = admin_client.post(url(ana, "suscripcion/sincronizar/"), format="json")

        assert response.status_code == 502
        assert response.json() == {"detail": PROVIDER_DOWN}
        sub.refresh_from_db()
        assert sub.status == "pending"
        ana.refresh_from_db()
        assert ana.plan_id == "basico"
        assert not Payment.objects.exists()
        assert not BackofficeAction.objects.exists()

    @respx.mock
    def test_payments_not_configured_is_a_503(self, admin_client, settings):
        settings.MERCADOPAGO_ACCESS_TOKEN = ""
        ana = account("ana@example.com")
        subscription(ana, status="pending")
        route = respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}")

        response = admin_client.post(url(ana, "suscripcion/sincronizar/"), format="json")

        assert response.status_code == 503
        assert response.json() == {"detail": NOT_ENABLED}
        assert not route.called
        assert not BackofficeAction.objects.exists()


@pytest.mark.usefixtures("mp_settings")
class TestCancel:
    @respx.mock
    @time_machine.travel(NOW, tick=False)
    def test_cancels_at_mercadopago_and_keeps_the_paid_month(self, admin_client, admin_user):
        ana = account("ana@example.com", plan_id="productor")
        sub = subscription(ana)
        route = respx.put(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
            return_value=httpx.Response(200, json=preapproval("cancelled", next_payment=NEXT))
        )

        response = admin_client.post(url(ana, "suscripcion/cancelar/"), format="json")

        assert response.status_code == 200
        assert route.call_count == 1
        assert response.json()["subscriptions"][0]["status"] == "cancelled"
        sub.refresh_from_db()
        assert (sub.status, sub.ended_at) == ("cancelled", None)
        ana.refresh_from_db()
        assert ana.plan_id == "productor"
        action = only_action()
        assert (action.actor, action.action, action.target_user, action.payload) == (
            admin_user,
            "subscription_cancel",
            ana,
            {"subscription": PREAPPROVAL_ID, "before": "authorized", "after": "cancelled"},
        )

    @respx.mock
    def test_goes_through_the_shared_cancel(self, admin_client, monkeypatch):
        from apps.payments import services

        ana = account("ana@example.com", plan_id="productor")
        subscription(ana)
        respx.put(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
            return_value=httpx.Response(200, json=preapproval("cancelled"))
        )
        calls = []
        real = services.cancel

        def spy(user):
            calls.append(user.pk)
            return real(user)

        monkeypatch.setattr(services, "cancel", spy)

        admin_client.post(url(ana, "suscripcion/cancelar/"), format="json")

        assert calls == [ana.pk]

    @respx.mock
    @pytest.mark.parametrize("status", [None, "pending", "cancelled"])
    def test_no_running_subscription_is_a_404(self, admin_client, status):
        ana = account("ana@example.com")
        if status:
            subscription(ana, status=status)
        route = respx.put(f"{API}/preapproval/{PREAPPROVAL_ID}")

        response = admin_client.post(url(ana, "suscripcion/cancelar/"), format="json")

        assert response.status_code == 404
        assert response.json() == {"detail": NO_SUBSCRIPTION}
        assert not route.called
        assert not BackofficeAction.objects.exists()

    @respx.mock
    def test_a_provider_error_is_a_502(self, admin_client):
        ana = account("ana@example.com", plan_id="productor")
        sub = subscription(ana)
        respx.put(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(return_value=httpx.Response(500))

        response = admin_client.post(url(ana, "suscripcion/cancelar/"), format="json")

        assert response.status_code == 502
        assert response.json() == {"detail": PROVIDER_DOWN}
        sub.refresh_from_db()
        assert sub.status == "authorized"
        assert not BackofficeAction.objects.exists()

    @respx.mock
    def test_payments_not_configured_is_a_503(self, admin_client, settings):
        settings.MERCADOPAGO_WEBHOOK_SECRET = ""
        ana = account("ana@example.com", plan_id="productor")
        subscription(ana)
        route = respx.put(f"{API}/preapproval/{PREAPPROVAL_ID}")

        response = admin_client.post(url(ana, "suscripcion/cancelar/"), format="json")

        assert response.status_code == 503
        assert response.json() == {"detail": NOT_ENABLED}
        assert not route.called
        assert not BackofficeAction.objects.exists()


PAYING = "La cuenta tiene una suscripción paga: cancelala primero."
PAID_DAYS = "La cuenta tiene días pagos hasta el 06/12/2026: dale la prueba después de esa fecha."


class TestPayingAccount:
    """A trial or a founder grant must never leave a paying account charged without service
    (or moved to Básico by expire_trials while it keeps paying)."""

    @pytest.fixture(autouse=True)
    def _frozen(self):
        with time_machine.travel(NOW, tick=False):
            yield

    @pytest.mark.parametrize("status", ["authorized", "paused"])
    @pytest.mark.parametrize(
        ("action", "body"), [("prueba/", {"hasta": "2026-12-31"}), ("founder/dar/", {})]
    )
    def test_is_refused_while_a_subscription_runs(self, admin_client, status, action, body):
        ana = account("ana@example.com", plan_id="productor")
        subscription(ana, status=status)

        response = admin_client.post(url(ana, action), body, format="json")

        assert response.status_code == 400
        assert response.json() == {"detail": PAYING}
        ana.refresh_from_db()
        assert (ana.plan_id, ana.plan_expires_at, ana.founder_number) == ("productor", None, None)
        assert not PlanChange.objects.exists()
        assert not BackofficeAction.objects.exists()

    def test_a_trial_is_refused_while_a_cancelled_subscription_has_paid_days(self, admin_client):
        ana = account("ana@example.com", plan_id="productor")
        subscription(ana, status="cancelled")

        response = admin_client.post(url(ana, "prueba/"), {"hasta": "2026-12-31"}, format="json")

        assert response.status_code == 400
        assert response.json() == {"detail": PAID_DAYS}
        ana.refresh_from_db()
        assert ana.plan_expires_at is None
        assert not BackofficeAction.objects.exists()

    def test_founder_is_granted_while_a_cancelled_subscription_has_paid_days(self, admin_client):
        ana = account("ana@example.com", plan_id="productor")
        subscription(ana, status="cancelled")

        response = admin_client.post(url(ana, "founder/dar/"), format="json")

        assert response.status_code == 200
        ana.refresh_from_db()
        assert ana.founder_number is not None

    @pytest.mark.parametrize(
        ("action", "body"), [("prueba/", {"hasta": "2026-12-31"}), ("founder/dar/", {})]
    )
    def test_an_ended_or_pending_subscription_does_not_block(self, admin_client, action, body):
        ana = account("ana@example.com")
        subscription(ana, status="cancelled", ended_at=NOW)
        ProviderSubscription.objects.create(
            user=ana,
            plan_id="productor",
            provider="mercadopago",
            currency="ARS",
            amount=14900,
            external_id="pending-checkout",
            status="pending",
        )

        response = admin_client.post(url(ana, action), body, format="json")

        assert response.status_code == 200
