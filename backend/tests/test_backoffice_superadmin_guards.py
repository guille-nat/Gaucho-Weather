"""Regression guards for backoffice-superadmin: access, CSRF, atomic writes, leaks (from T3)."""

import csv
import io
from datetime import UTC, date, datetime, timedelta

import httpx
import pytest
import respx
import time_machine
from django.core import mail
from rest_framework.test import APIClient

from apps.accounts.models import FounderProgram, PlanChange, User
from apps.backoffice.models import BackofficeAction
from apps.payments.models import Payment

from .conftest import PASSWORD
from .test_backoffice import account, client_for
from .test_backoffice_accounts import ENDPOINTS, subscription, url
from .test_payments import API, PREAPPROVAL_ID, SECRET, mp_payment, preapproval

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 11, 16, 12, tzinfo=UTC)
EXPORTS = ["cuentas", "pagos", "registro"]
REPORTS = ["ingresos/", "usuarios/", "uso/"] + [f"exportar/{n}.csv" for n in EXPORTS]


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(email="jefe@example.com", password=PASSWORD, name="Jefe")


@pytest.fixture
def mp(settings):
    settings.MERCADOPAGO_ACCESS_TOKEN = "TEST-access-token"
    settings.MERCADOPAGO_WEBHOOK_SECRET = SECRET
    settings.MERCADOPAGO_API_URL = API


def csrf_admin(admin_user):
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(admin_user)
    return client


# --- item 2: security -------------------------------------------------------------------------


@pytest.mark.parametrize(("method", "action", "body"), [e for e in ENDPOINTS if e[0] != "get"])
def test_every_write_needs_the_csrf_token(admin_user, method, action, body):
    target = account("ana@example.com")
    response = getattr(csrf_admin(admin_user), method)(url(target, action), body, format="json")
    assert response.status_code == 403
    assert "CSRF" in response.json()["detail"]
    assert not BackofficeAction.objects.exists()


@pytest.mark.parametrize("path", REPORTS)
def test_reports_and_exports_refuse_anonymous_and_normal_users(path):
    normal = account("ana@example.com")
    for client in (APIClient(), client_for(normal)):
        response = client.get(f"/api/backoffice/informes/{path}")
        assert response.status_code == 403
    assert not BackofficeAction.objects.exists()


def test_a_blocked_superadmin_loses_the_backoffice_too(admin_user):
    other = User.objects.create_superuser(email="otro@example.com", password=PASSWORD, name="Otro")
    victim_session = client_for(other)
    assert victim_session.get("/api/backoffice/resumen/").status_code == 200
    assert (
        client_for(admin_user).post(url(other, "bloquear/"), {}, format="json").status_code == 200
    )
    assert victim_session.get("/api/backoffice/resumen/").status_code == 403
    assert victim_session.get("/api/auth/me/").status_code == 403
    login = APIClient().post(
        "/api/auth/login/", {"email": "otro@example.com", "password": PASSWORD}, format="json"
    )
    assert login.status_code in (400, 401, 403)


def test_patch_ignores_privilege_and_plan_fields(admin_user):
    ana = account("ana@example.com")
    response = client_for(admin_user).patch(
        url(ana),
        {
            "name": "Ana B",
            "is_superuser": True,
            "is_staff": True,
            "is_active": False,
            "plan": "empresa",
            "plan_id": "empresa",
            "founder_number": 7,
            "plan_expires_at": "2030-01-01T00:00:00Z",
            "password": "x",
        },
        format="json",
    )
    assert response.status_code == 200
    ana.refresh_from_db()
    assert (ana.name, ana.is_superuser, ana.is_staff, ana.is_active) == (
        "Ana B",
        False,
        False,
        True,
    )
    assert (ana.plan_id, ana.founder_number, ana.plan_expires_at) == ("basico", None, None)
    assert ana.check_password(PASSWORD)
    assert BackofficeAction.objects.get().payload == {
        "before": {"name": "Ana"},
        "after": {"name": "Ana B"},
    }


def test_email_is_normalized_and_unique_case_insensitively(admin_user):
    ana = account("ana@example.com")
    account("bob@example.com", name="Bob")
    client = client_for(admin_user)
    taken = client.patch(url(ana), {"email": "  BOB@Example.COM "}, format="json")
    assert taken.status_code == 400
    assert taken.json() == {"email": ["Ya hay una cuenta con ese email."]}
    ok = client.patch(url(ana), {"email": "Ana.Nueva@Example.COM"}, format="json")
    assert ok.status_code == 200
    ana.refresh_from_db()
    assert ana.email == "ana.nueva@example.com"
    same = client.patch(url(ana), {"email": "ANA.NUEVA@example.com"}, format="json")
    assert same.status_code == 200
    assert BackofficeAction.objects.count() == 1


def test_self_block_and_self_revoke_refused(admin_user):
    client = client_for(admin_user)
    for action in ("bloquear/", "superadmin/quitar/"):
        response = client.post(url(admin_user, action), {}, format="json")
        assert response.status_code == 400
        assert response.json() == {"detail": "No podés hacer eso con tu propia cuenta."}
    admin_user.refresh_from_db()
    assert admin_user.is_active and admin_user.is_superuser and admin_user.is_staff
    assert not BackofficeAction.objects.exists()


@time_machine.travel(NOW, tick=False)
def test_record_and_exports_never_leak_secrets(admin_user):
    ana = account("ana@example.com")
    sub = subscription(ana)
    Payment.objects.create(
        user=ana,
        subscription=sub,
        provider="mercadopago",
        external_id="9001",
        amount=14900,
        currency="ARS",
        status="approved",
        paid_at=NOW,
        payload={"payer": {"email": "secreto@example.com"}, "card": "tok_SECRET"},
    )
    client = client_for(admin_user)
    texts = [client.get(url(ana)).content.decode()]
    for name in EXPORTS:
        texts.append(client.get(f"/api/backoffice/informes/exportar/{name}.csv").content.decode())
    for text in texts:
        for secret in ("secreto@example.com", "tok_SECRET", "checkout", "pbkdf2", "password"):
            assert secret not in text, (secret, text[:200])


def test_csv_injection_in_name_email_and_log(admin_user):
    evil = account("evil@example.com", name='=HYPERLINK("http://x")')
    client = client_for(admin_user)
    client.patch(url(evil), {"name": "@SUM(1)"}, format="json")
    body = client.get("/api/backoffice/informes/exportar/cuentas.csv").content.decode()
    assert body.startswith("﻿")
    rows = list(csv.reader(io.StringIO(body.lstrip("﻿"))))
    names = [row[1] for row in rows[1:]]
    assert "'@SUM(1)" in names
    assert not any(cell.startswith(("=", "+", "-", "@")) for row in rows for cell in row)
    log = client.get("/api/backoffice/informes/exportar/registro.csv").content.decode()
    rows = list(csv.reader(io.StringIO(log.lstrip("﻿"))))
    assert not any(cell.startswith(("=", "+", "-", "@")) for row in rows for cell in row)


# --- item 1: data -----------------------------------------------------------------------------


class Boom(Exception):
    pass


def boom(*args, **kwargs):
    raise Boom


WRITES = [
    ("patch", "", {"name": "Otra", "email": "otra@example.com"}),
    ("post", "bloquear/", {}),
    ("post", "superadmin/dar/", {}),
    # A month from the real today: the trial ends at most a year ahead (cortesias S6).
    ("post", "prueba/", {"hasta": (date.today() + timedelta(days=30)).isoformat()}),
    ("post", "founder/dar/", {}),
]


@pytest.mark.parametrize(("method", "action", "body"), WRITES)
def test_a_failing_log_row_rolls_the_change_back(admin_user, monkeypatch, method, action, body):
    ana = account("ana@example.com")
    program, _ = FounderProgram.objects.get_or_create(pk=1)
    next_number = program.next_number
    monkeypatch.setattr(BackofficeAction, "record", boom)
    client = client_for(admin_user)
    client.raise_request_exception = False
    response = getattr(client, method)(url(ana, action), body, format="json")
    assert response.status_code == 500
    ana.refresh_from_db()
    assert (ana.name, ana.email, ana.is_active, ana.is_superuser) == (
        "Ana",
        "ana@example.com",
        True,
        False,
    )
    assert (ana.plan_id, ana.plan_expires_at, ana.founder_number) == ("basico", None, None)
    assert not PlanChange.objects.filter(user=ana).exists()
    assert FounderProgram.objects.get(pk=1).next_number == next_number


def test_a_failing_log_row_rolls_back_founder_revoke(admin_user, monkeypatch):
    ana = account("ana@example.com", founder_number=3, plan_id="productor")
    monkeypatch.setattr(BackofficeAction, "record", boom)
    client = client_for(admin_user)
    client.raise_request_exception = False
    assert client.post(url(ana, "founder/quitar/"), {}, format="json").status_code == 500
    ana.refresh_from_db()
    assert ana.founder_number == 3


@time_machine.travel(NOW, tick=False)
@respx.mock
def test_sync_writes_nothing_when_a_charge_fails_midway(admin_user, mp):
    ana = account("ana@example.com")
    sub = subscription(ana, status="pending")
    respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval("authorized"))
    )
    respx.get(f"{API}/authorized_payments/search").mock(
        return_value=httpx.Response(
            200, json={"results": [{"payment": {"id": 9001}}, {"payment": {"id": 9002}}]}
        )
    )
    respx.get(f"{API}/v1/payments/9001").mock(return_value=httpx.Response(200, json=mp_payment()))
    respx.get(f"{API}/v1/payments/9002").mock(return_value=httpx.Response(500))
    response = client_for(admin_user).post(url(ana, "suscripcion/sincronizar/"), {}, format="json")
    assert response.status_code == 502
    assert response.json() == {
        "detail": "No pudimos conectar con Mercado Pago. Probá de nuevo en un rato."
    }
    sub.refresh_from_db()
    ana.refresh_from_db()
    assert sub.status == "pending" and ana.plan_id == "basico"
    assert not Payment.objects.exists()
    assert not BackofficeAction.objects.exists()


@time_machine.travel(NOW, tick=False)
@respx.mock
def test_sync_with_a_failing_log_row_rolls_back_the_subscription(admin_user, mp, monkeypatch):
    ana = account("ana@example.com")
    sub = subscription(ana, status="pending")
    respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval("authorized"))
    )
    respx.get(f"{API}/authorized_payments/search").mock(
        return_value=httpx.Response(200, json={"results": [{"payment": {"id": 9001}}]})
    )
    respx.get(f"{API}/v1/payments/9001").mock(return_value=httpx.Response(200, json=mp_payment()))
    monkeypatch.setattr(BackofficeAction, "record", boom)
    client = client_for(admin_user)
    client.raise_request_exception = False
    assert client.post(url(ana, "suscripcion/sincronizar/"), {}, format="json").status_code == 500
    sub.refresh_from_db()
    ana.refresh_from_db()
    assert sub.status == "pending" and ana.plan_id == "basico"
    assert not Payment.objects.exists()
    assert not PlanChange.objects.filter(user=ana).exists()


def test_founder_numbers_are_unique_across_grants(admin_user):
    client = client_for(admin_user)
    users = [account(f"u{i}@example.com", name=f"U{i}") for i in range(4)]
    account(
        "hand@example.com",
        founder_number=FounderProgram.objects.get_or_create(pk=1)[0].next_number + 1,
    )
    for user in users:
        assert client.post(url(user, "founder/dar/"), {}, format="json").status_code == 200
    numbers = list(
        User.objects.exclude(founder_number=None).values_list("founder_number", flat=True)
    )
    assert len(numbers) == len(set(numbers)) == 5


@time_machine.travel(datetime(2026, 11, 16, 2, 30, tzinfo=UTC), tick=False)
def test_trial_end_of_day_is_buenos_aires_and_today_there_is_not_future(admin_user):
    # 02:30 UTC on Nov 16 is still Nov 15 in Buenos Aires.
    ana = account("ana@example.com")
    client = client_for(admin_user)
    today_ba = client.post(url(ana, "prueba/"), {"hasta": "2026-11-15"}, format="json")
    assert today_ba.status_code == 400
    assert today_ba.json() == {"hasta": ["La fecha tiene que ser futura."]}
    tomorrow_ba = client.post(url(ana, "prueba/"), {"hasta": "2026-11-16"}, format="json")
    assert tomorrow_ba.status_code == 200
    ana.refresh_from_db()
    assert ana.plan_id == "productor"
    assert ana.plan_expires_at == datetime(2026, 11, 17, 2, 59, 59, tzinfo=UTC)
    assert tomorrow_ba.json()["plan_expires_at"] == "2026-11-16T23:59:59-03:00"


def test_reset_email_for_a_blocked_account_is_refused(admin_user):
    ana = account("ana@example.com", is_active=False)
    response = client_for(admin_user).post(url(ana, "restablecer-contrasena/"), {}, format="json")
    assert response.status_code == 400
    assert response.json() == {"detail": "La cuenta está bloqueada."}
    assert not mail.outbox
    assert not BackofficeAction.objects.exists()


def test_report_amounts_are_json_numbers(admin_user):
    ana = account("ana@example.com")
    subscription(ana)
    body = client_for(admin_user).get("/api/backoffice/informes/ingresos/").json()
    assert isinstance(body["mrr_ars"], (int, float)) and body["mrr_ars"] == 14900
    assert len(body["meses"]) == 12
    assert all(isinstance(m["cobrado_ars"], (int, float)) for m in body["meses"])


def test_export_logged_with_file_and_rows(admin_user):
    account("ana@example.com")
    client = client_for(admin_user)
    response = client.get("/api/backoffice/informes/exportar/cuentas.csv")
    assert response["Content-Type"] == "text/csv; charset=utf-8"
    entry = BackofficeAction.objects.get()
    assert (entry.action, entry.payload) == ("export", {"file": "cuentas.csv", "rows": 2})
