"""Clear terms: version, acceptance and the confirmation email (odd/tasks/promociones.md S0b-S0e).

Every Mercado Pago call is mocked with respx: the tests never reach the real API.
"""

import json

import httpx
import pytest
import respx
from django.core import mail

from apps.accounts import terms
from apps.accounts.models import Plan, TermsAcceptance, User
from apps.payments.models import ProviderSubscription

from .conftest import PASSWORD
from .test_payments import (
    API,
    PREAPPROVAL_ID,
    SECRET,
    SUBSCRIBE,
    client_for,
    notify,
    preapproval,
)

pytestmark = pytest.mark.django_db

REGISTER = "/api/auth/register/"
LOGIN = "/api/auth/login/"
ME = "/api/auth/me/"
CSRF = "/api/auth/csrf/"
ACCEPT = "/api/auth/terminos/aceptar/"
TERMS_REQUIRED = "Tenés que aceptar los términos y la política de privacidad."
APP = "https://clima.example.com"


@pytest.fixture(autouse=True)
def mercadopago(settings):
    settings.MERCADOPAGO_ACCESS_TOKEN = "TEST-access-token"
    settings.MERCADOPAGO_WEBHOOK_SECRET = SECRET
    settings.MERCADOPAGO_API_URL = API
    Plan.objects.filter(code=Plan.BASICO).update(price_ars_month=0, price_usd_month=0)
    Plan.objects.filter(code=Plan.PRODUCTOR).update(price_ars_month=14900, price_usd_month=10)
    Plan.objects.filter(code=Plan.EMPRESA).update(price_ars_month=49900, price_usd_month=35)


def acceptances(user):
    return list(TermsAcceptance.objects.filter(user=user).values_list("version", "context"))


def test_the_version_is_one_dated_string():
    assert terms.TERMS_VERSION == "2026-11-19"


# --- S0b: sign-up -------------------------------------------------------------------------


@pytest.mark.parametrize("extra", [{}, {"acepta_terminos": False}, {"acepta_terminos": "false"}])
def test_registering_without_accepting_the_terms_is_refused(api_client, extra):
    response = api_client.post(
        REGISTER,
        {"email": "pedro@example.com", "password": PASSWORD, "name": "Pedro", **extra},
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {"acepta_terminos": [TERMS_REQUIRED]}
    assert User.objects.count() == 0
    assert TermsAcceptance.objects.count() == 0
    assert api_client.get(ME).status_code == 403  # not signed in


def test_the_terms_error_comes_with_the_other_field_errors(api_client):
    response = api_client.post(REGISTER, {"email": "no-es-email", "name": "Ana"}, format="json")

    assert response.status_code == 400
    assert response.json()["acepta_terminos"] == [TERMS_REQUIRED]
    assert set(response.json()) == {"email", "password", "acepta_terminos"}


def test_registering_records_the_signup_acceptance_and_me_says_so(api_client):
    response = api_client.post(
        REGISTER,
        {
            "email": "pedro@example.com",
            "password": PASSWORD,
            "name": "Pedro",
            "acepta_terminos": True,
        },
        format="json",
    )

    assert response.status_code == 201
    user = User.objects.get()
    assert acceptances(user) == [("2026-11-19", "signup")]
    body = response.json()
    assert (body["terms_version"], body["terms_accepted"]) == ("2026-11-19", True)
    assert "acepta_terminos" not in body
    me = api_client.get(ME).json()
    assert (me["terms_version"], me["terms_accepted"]) == ("2026-11-19", True)


# --- S0b: /api/auth/me/ -------------------------------------------------------------------


def test_me_says_an_account_without_acceptance_has_not_accepted(auth_client):
    body = auth_client.get(ME).json()

    assert (body["terms_version"], body["terms_accepted"]) == ("2026-11-19", False)
    # The other fields are the same as before (S0b only adds two).
    assert set(body) == {
        "id",
        "email",
        "name",
        "plan",
        "plan_expires_at",
        "founder_number",
        "usage",
        "notify_push",
        "notify_email",
        "is_superuser",
        "terms_version",
        "terms_accepted",
    }


def test_an_older_version_is_not_the_current_acceptance(auth_client, user):
    TermsAcceptance.objects.create(user=user, version="2026-01-01", context="signup")

    assert auth_client.get(ME).json()["terms_accepted"] is False


def test_another_accounts_acceptance_does_not_count(auth_client, make_user):
    other = make_user(email="otro@example.com")
    terms.record_acceptance(other, TermsAcceptance.Context.SIGNUP)

    assert auth_client.get(ME).json()["terms_accepted"] is False


def test_login_still_signs_in_and_answers_the_account_with_the_terms_fields(api_client, user):
    response = api_client.post(LOGIN, {"email": user.email, "password": PASSWORD}, format="json")

    assert response.status_code == 200
    body = response.json()
    assert (body["id"], body["email"], body["name"]) == (user.id, "ana@example.com", "Ana")
    assert (body["terms_version"], body["terms_accepted"]) == ("2026-11-19", False)
    assert api_client.get(ME).status_code == 200


# --- S0c: accepting updated terms ---------------------------------------------------------


def test_accepting_the_updated_terms_records_update_once(auth_client, user):
    TermsAcceptance.objects.create(user=user, version="2026-01-01", context="signup")

    first = auth_client.post(ACCEPT)
    second = auth_client.post(ACCEPT)

    assert first.status_code == 200
    assert (first.json()["id"], first.json()["terms_accepted"]) == (user.id, True)
    assert second.status_code == 200
    assert acceptances(user) == [("2026-11-19", "update"), ("2026-01-01", "signup")]
    assert auth_client.get(ME).json()["terms_accepted"] is True


def test_accepting_needs_a_session(api_client):
    response = api_client.post(ACCEPT)

    assert response.status_code == 403
    assert TermsAcceptance.objects.count() == 0


def test_accepting_needs_the_csrf_token(csrf_client, user):
    csrf_client.force_login(user)

    assert csrf_client.post(ACCEPT).status_code == 403
    token = csrf_client.get(CSRF).cookies["csrftoken"].value
    assert csrf_client.post(ACCEPT, HTTP_X_CSRFTOKEN=token).status_code == 200
    assert acceptances(user) == [("2026-11-19", "update")]


# --- S0b: subscribing ---------------------------------------------------------------------


def mock_create(amount=14900):
    return respx.post(f"{API}/preapproval").mock(
        return_value=httpx.Response(201, json=preapproval(amount=amount))
    )


@pytest.mark.parametrize("extra", [{}, {"acepta_terminos": False}])
@respx.mock
def test_subscribing_without_accepting_the_terms_is_refused(user, extra):
    route = mock_create()

    response = client_for(user).post(
        SUBSCRIBE, {"plan": "productor", "currency": "ARS", **extra}, format="json"
    )

    assert response.status_code == 400
    assert response.json() == {"acepta_terminos": [TERMS_REQUIRED]}
    assert not route.called
    assert ProviderSubscription.objects.count() == 0
    assert TermsAcceptance.objects.count() == 0


@respx.mock
def test_subscribing_records_the_subscribe_acceptance(user):
    route = mock_create()

    response = client_for(user).post(
        SUBSCRIBE, {"plan": "productor", "currency": "ARS", "acepta_terminos": True}, format="json"
    )

    assert response.status_code == 201
    assert response.json() == {"checkout_url": preapproval()["init_point"]}
    assert (
        json.loads(route.calls.last.request.content)["auto_recurring"]["transaction_amount"]
        == 14900
    )
    assert ProviderSubscription.objects.get().status == "pending"
    assert acceptances(user) == [("2026-11-19", "subscribe")]


@respx.mock
def test_a_refused_subscription_records_no_acceptance(user):
    route = mock_create()

    response = client_for(user).post(
        SUBSCRIBE, {"plan": "basico", "currency": "ARS", "acepta_terminos": True}, format="json"
    )

    assert response.status_code == 400
    assert not route.called
    assert TermsAcceptance.objects.count() == 0


# --- S0e: the confirmation email ----------------------------------------------------------


def subscription(user, plan=Plan.PRODUCTOR, amount=14900, status="pending"):
    return ProviderSubscription.objects.create(
        user=user,
        plan_id=plan,
        provider="mercadopago",
        currency="ARS",
        amount=amount,
        external_id=PREAPPROVAL_ID,
        status=status,
        checkout_url="https://www.mercadopago.com.ar/subscriptions/checkout",
    )


def mock_read(status, amount=14900):
    return respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status=status, amount=amount))
    )


def webhook(capture):
    with capture(execute=True):
        assert notify("subscription_preapproval", PREAPPROVAL_ID).status_code == 200


@respx.mock
def test_an_authorized_subscription_sends_one_confirmation_email(
    user, django_capture_on_commit_callbacks
):
    subscription(user)
    mock_read("authorized")

    webhook(django_capture_on_commit_callbacks)

    [message] = mail.outbox
    assert message.to == ["ana@example.com"]
    assert message.subject == "Tu suscripción a Gaucho Weather está activa"
    body = message.body
    assert "Hola Ana:" in body
    assert "plan Productor" in body
    assert "$ 14.900 por mes" in body
    assert "Se renueva sola todos los meses" in body
    assert f"{APP}/perfil/suscripcion" in body
    assert "«Darme de baja»" in body
    assert "hasta el final del mes que ya pagaste" in body
    assert f"{APP}/terminos" in body
    assert f"{APP}/privacidad" in body
    assert f"{APP}/reglas" in body
    assert "founder" not in body
    sub = ProviderSubscription.objects.get()
    assert sub.status == "authorized"
    assert sub.confirmation_sent_at is not None
    # The existing rule still holds: the authorized subscription moved the plan up.
    user.refresh_from_db()
    assert user.plan_id == "productor"


@respx.mock
def test_a_repeated_authorized_webhook_sends_no_second_email(
    user, django_capture_on_commit_callbacks
):
    subscription(user)
    mock_read("authorized")

    webhook(django_capture_on_commit_callbacks)
    webhook(django_capture_on_commit_callbacks)

    assert len(mail.outbox) == 1


@respx.mock
def test_a_resumed_subscription_sends_no_second_email(user, django_capture_on_commit_callbacks):
    subscription(user)
    route = mock_read("authorized")
    webhook(django_capture_on_commit_callbacks)
    route.return_value = httpx.Response(200, json=preapproval(status="paused"))
    webhook(django_capture_on_commit_callbacks)
    route.return_value = httpx.Response(200, json=preapproval(status="authorized"))

    webhook(django_capture_on_commit_callbacks)

    assert len(mail.outbox) == 1


@pytest.mark.parametrize("status", ["pending", "cancelled", "paused"])
@respx.mock
def test_no_email_when_the_subscription_is_not_authorized(
    user, django_capture_on_commit_callbacks, status
):
    subscription(user)
    mock_read(status)

    webhook(django_capture_on_commit_callbacks)

    assert mail.outbox == []
    assert ProviderSubscription.objects.get().confirmation_sent_at is None


@respx.mock
def test_a_subscription_authorized_before_the_email_existed_gets_none(
    user, django_capture_on_commit_callbacks
):
    subscription(user, status="authorized")
    mock_read("authorized")

    webhook(django_capture_on_commit_callbacks)

    assert mail.outbox == []


@respx.mock
def test_a_founders_confirmation_says_it_is_the_difference(
    user, django_capture_on_commit_callbacks
):
    User.objects.filter(pk=user.pk).update(plan_id=Plan.PRODUCTOR, founder_number=7)
    subscription(user, plan=Plan.EMPRESA, amount=35000)
    mock_read("authorized", amount=35000)

    webhook(django_capture_on_commit_callbacks)

    [message] = mail.outbox
    assert "plan Empresa" in message.body
    assert "$ 35.000 por mes" in message.body
    assert "Como founder pagás solo la diferencia con Productor" in message.body
    user.refresh_from_db()
    assert (user.plan_id, user.founder_number) == ("empresa", 7)


@respx.mock
def test_a_lost_email_does_not_undo_the_subscription(
    user, django_capture_on_commit_callbacks, monkeypatch
):
    def broken(*args, **kwargs):
        raise OSError("smtp down")

    monkeypatch.setattr("apps.payments.services.send_mail", broken)
    subscription(user)
    mock_read("authorized")

    webhook(django_capture_on_commit_callbacks)

    assert ProviderSubscription.objects.get().status == "authorized"
    user.refresh_from_db()
    assert user.plan_id == "productor"
