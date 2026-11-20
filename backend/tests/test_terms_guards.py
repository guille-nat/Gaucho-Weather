"""Regression guards for the clear terms (promociones S0b, S0c, S0e), from the T0 verifier."""

import json
import threading

import httpx
import pytest
import respx
from django.core import mail
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.models import Plan, TermsAcceptance
from apps.payments import services
from apps.payments.models import ProviderSubscription
from apps.payments.providers import get_provider

from .conftest import PASSWORD
from .test_payments import (
    API,
    PREAPPROVAL_ID,
    SECRET,
    client_for,
    notify,
    preapproval,
    subscription,
)

REGISTER = "/api/auth/register/"
ACCEPT = "/api/auth/terminos/aceptar/"
SUBSCRIBE = "/api/pagos/suscribirme/"
CSRF = "/api/auth/csrf/"


@pytest.fixture(autouse=True)
def mp(settings):
    settings.MERCADOPAGO_ACCESS_TOKEN = "TEST-access-token"
    settings.MERCADOPAGO_WEBHOOK_SECRET = SECRET
    settings.MERCADOPAGO_API_URL = API
    Plan.objects.filter(code=Plan.BASICO).update(price_ars_month=0, price_usd_month=0)
    Plan.objects.filter(code=Plan.PRODUCTOR).update(price_ars_month=14900, price_usd_month=10)
    Plan.objects.filter(code=Plan.EMPRESA).update(price_ars_month=49900, price_usd_month=35)


# --- auth on the accept endpoint ----------------------------------------------------------


@pytest.mark.django_db
def test_accept_anonymous_is_403(csrf_client):
    csrf_client.get(CSRF)
    token = csrf_client.cookies["csrftoken"].value
    assert csrf_client.post(ACCEPT, HTTP_X_CSRFTOKEN=token).status_code == 403
    assert TermsAcceptance.objects.count() == 0


@pytest.mark.django_db
def test_accept_without_csrf_is_403_with_csrf_200(user):
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(user)
    assert client.post(ACCEPT).status_code == 403
    assert TermsAcceptance.objects.count() == 0
    client.get(CSRF)
    token = client.cookies["csrftoken"].value
    assert client.post(ACCEPT, HTTP_X_CSRFTOKEN=token).status_code == 200


@pytest.mark.django_db
def test_accept_cannot_target_another_user(user, make_user):
    other = make_user(email="otro@example.com", name="Otro")
    body = (
        client_for(user)
        .post(ACCEPT, {"user": other.pk, "user_id": other.pk, "email": other.email}, format="json")
        .json()
    )
    assert body["email"] == user.email
    assert TermsAcceptance.objects.filter(user=other).count() == 0
    assert TermsAcceptance.objects.filter(user=user).count() == 1


@pytest.mark.django_db
def test_accept_get_is_405(user):
    assert client_for(user).get(ACCEPT).status_code == 405


# --- which values of acepta_terminos are accepted ------------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize(
    "value,ok",
    [
        (True, True),
        ("true", False),  # only a JSON true counts: no loose truthy strings or numbers
        ("True", False),
        (1, False),
        ("1", False),
        ("on", False),
        ("yes", False),
        (False, False),
        ("false", False),
        (0, False),
        ("0", False),
        (None, False),
        ("", False),
        ("si", False),
        ([True], False),
        ({}, False),
    ],
)
def test_register_acepta_terminos_values(api_client, value, ok):
    r = api_client.post(
        REGISTER,
        {"email": "p@example.com", "password": PASSWORD, "name": "P", "acepta_terminos": value},
        format="json",
    )
    assert (r.status_code == 201) is ok
    if not ok:
        assert r.json()["acepta_terminos"] == [
            "Tenés que aceptar los términos y la política de privacidad."
        ]
    assert TermsAcceptance.objects.count() == (1 if ok else 0)


@pytest.mark.django_db
@respx.mock
@pytest.mark.parametrize("extra", [{}, {"acepta_terminos": False}])
def test_subscribe_refused_without_terms_and_no_mp_call(user, extra):
    route = respx.post(f"{API}/preapproval").mock(
        return_value=httpx.Response(201, json=preapproval())
    )
    r = client_for(user).post(
        SUBSCRIBE, {"plan": "productor", "currency": "ARS", **extra}, format="json"
    )
    assert r.status_code == 400
    assert r.json() == {
        "acepta_terminos": ["Tenés que aceptar los términos y la política de privacidad."]
    }
    assert not route.called
    assert ProviderSubscription.objects.count() == 0
    assert TermsAcceptance.objects.count() == 0


# --- S0e: no email for pre-deploy authorized rows ------------------------------------------


@pytest.mark.django_db
@respx.mock
def test_old_authorized_row_gets_no_email_on_later_webhooks(
    user, django_capture_on_commit_callbacks
):
    sub = subscription(user, status="authorized")
    assert sub.confirmation_sent_at is None
    respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status="authorized"))
    )
    respx.get(f"{API}/v1/payments/9001").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": 9001,
                "status": "approved",
                "transaction_amount": 14900,
                "currency_id": "ARS",
                "date_approved": "2026-11-17T12:00:00+00:00",
                "metadata": {"preapproval_id": PREAPPROVAL_ID},
                "payer": {"email": "ana@example.com"},
            },
        )
    )
    with django_capture_on_commit_callbacks(execute=True):
        assert notify("subscription_preapproval", PREAPPROVAL_ID).status_code in (200, 201, 204)
        notify("payment", "9001")
        # a backoffice-style re-sync
        services.sync_subscription(
            "mercadopago", get_provider("mercadopago").fetch_subscription(PREAPPROVAL_ID)
        )
    assert mail.outbox == []
    sub.refresh_from_db()
    assert sub.confirmation_sent_at is None


@pytest.mark.django_db
@respx.mock
def test_paused_then_authorized_old_row_gets_no_email(user, django_capture_on_commit_callbacks):
    subscription(user, status="paused")
    respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status="authorized"))
    )
    with django_capture_on_commit_callbacks(execute=True):
        notify("subscription_preapproval", PREAPPROVAL_ID)
    assert mail.outbox == []


# --- S0e: two concurrent authorized webhooks -> one email ----------------------------------


@pytest.mark.django_db(transaction=True)
@respx.mock
def test_two_concurrent_authorized_syncs_send_one_email(make_user):
    from apps.accounts.plans import ensure_default_plans

    ensure_default_plans()
    Plan.objects.filter(code=Plan.PRODUCTOR).update(price_ars_month=14900, price_usd_month=10)
    user = make_user()
    subscription(user, status="pending")
    respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status="authorized"))
    )
    remote = get_provider("mercadopago").fetch_subscription(PREAPPROVAL_ID)
    barrier = threading.Barrier(2)
    errors = []

    def run():
        try:
            barrier.wait()
            services.sync_subscription("mercadopago", remote)
        except Exception as exc:  # pragma: no cover
            errors.append(exc)
        finally:
            connection.close()

    threads = [threading.Thread(target=run) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert errors == []
    assert len(mail.outbox) == 1
    assert ProviderSubscription.objects.get().confirmation_sent_at is not None


# --- contracts: dump outputs of existing endpoints (diffed base vs head) -------------------


def _scrub(obj):
    if isinstance(obj, dict):
        return {
            k: ("<ts>" if k.endswith("_at") or k == "date_joined" else _scrub(v))
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_scrub(x) for x in obj]
    return obj


@pytest.mark.django_db
@respx.mock
def test_dump_contracts(user, django_capture_on_commit_callbacks, tmp_path_factory):
    import os

    out = {}
    c = APIClient()

    def rec(name, r):
        try:
            body = r.json()
        except Exception:
            body = r.content.decode()
        out[name] = [r.status_code, _scrub(body)]

    rec(
        "login",
        c.post("/api/auth/login/", {"email": user.email, "password": PASSWORD}, format="json"),
    )
    rec(
        "login_bad",
        c.post("/api/auth/login/", {"email": user.email, "password": "x"}, format="json"),
    )
    rec("me", c.get("/api/auth/me/"))
    rec("me_patch", c.patch("/api/auth/me/", {"name": "Ana B"}, format="json"))
    rec("planes", c.get("/api/planes/"))
    rec("suscripcion", c.get("/api/auth/suscripcion/"))
    rec("pagos_empty", c.get("/api/pagos/"))
    respx.post(f"{API}/preapproval").mock(return_value=httpx.Response(201, json=preapproval()))
    rec(
        "subscribe",
        c.post(
            SUBSCRIBE,
            {"plan": "productor", "currency": "ARS", "acepta_terminos": True},
            format="json",
        ),
    )
    respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status="authorized"))
    )
    with django_capture_on_commit_callbacks(execute=True):
        rec("webhook", notify("subscription_preapproval", PREAPPROVAL_ID))
        rec("webhook_bad_sig", notify("subscription_preapproval", PREAPPROVAL_ID, headers={}))
    rec("pagos_after", c.get("/api/pagos/"))
    rec("suscripcion_after", c.get("/api/auth/suscripcion/"))
    rec("me_after", c.get("/api/auth/me/"))
    rec("anon_me", APIClient().get("/api/auth/me/"))
    rec(
        "register",
        APIClient().post(
            REGISTER,
            {"email": "n@example.com", "password": PASSWORD, "name": "N", "acepta_terminos": True},
            format="json",
        ),
    )
    path = os.environ.get("PROBE_OUT", "/tmp/v_contracts.json")
    with open(path, "w") as fh:
        json.dump(out, fh, indent=1, sort_keys=True, ensure_ascii=False)
