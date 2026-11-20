"""A founder moving up to Empresa pays only the difference (odd/tasks/promociones.md SF1-SF5).

Every Mercado Pago call is mocked with respx: the tests never reach the real API.
"""

import json
from datetime import timedelta

import httpx
import pytest
import respx
import time_machine
from django.core import mail

from apps.accounts.models import Plan, PlanChange, PlanRequest, User
from apps.backoffice.models import BackofficeAction
from apps.payments import tasks
from apps.payments.models import ProviderSubscription

from .conftest import PASSWORD
from .test_payments import (
    API,
    NEXT,
    NOW,
    PLANS,
    PREAPPROVAL_ID,
    SECRET,
    SUBSCRIBE,
    client_for,
    notify,
    preapproval,
)

pytestmark = pytest.mark.django_db

FOUNDER_IS_FREE = "Como founder ya tenés Productor gratis para siempre."
NO_ARS_PRICE = "Ese plan todavía no tiene precio en pesos."
FOUNDER_PAYS_EMPRESA = "Como founder, Empresa se paga con Mercado Pago: pagás solo la diferencia."
REQUEST = "/api/auth/suscripcion/pedido/"
BACKOFFICE = "/api/backoffice/"


@pytest.fixture(autouse=True)
def mercadopago(settings):
    settings.MERCADOPAGO_ACCESS_TOKEN = "TEST-access-token"
    settings.MERCADOPAGO_WEBHOOK_SECRET = SECRET
    settings.MERCADOPAGO_API_URL = API
    Plan.objects.filter(code=Plan.BASICO).update(price_ars_month=0, price_usd_month=0)
    Plan.objects.filter(code=Plan.PRODUCTOR).update(price_ars_month=14900, price_usd_month=10)
    Plan.objects.filter(code=Plan.EMPRESA).update(price_ars_month=49900, price_usd_month=35)


def founder(user, plan=Plan.PRODUCTOR, number=7):
    User.objects.filter(pk=user.pk).update(plan_id=plan, founder_number=number)
    user.refresh_from_db()
    return user


def empresa_subscription(user, status="pending", amount=35000, next_payment_at=None):
    return ProviderSubscription.objects.create(
        user=user,
        plan_id=Plan.EMPRESA,
        provider="mercadopago",
        currency="ARS",
        amount=amount,
        external_id=PREAPPROVAL_ID,
        status=status,
        checkout_url="https://www.mercadopago.com.ar/subscriptions/checkout",
        next_payment_at=next_payment_at,
    )


def mock_create(amount):
    return respx.post(f"{API}/preapproval").mock(
        return_value=httpx.Response(201, json=preapproval(amount=amount))
    )


def mock_read(status, amount=35000, next_payment=NEXT):
    return respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(
            200, json=preapproval(status=status, amount=amount, next_payment=next_payment)
        )
    )


@pytest.fixture
def admin_client(db):
    admin = User.objects.create_superuser(email="jefe@example.com", password=PASSWORD, name="Jefe")
    return client_for(admin)


# --- SF1: subscribing -----------------------------------------------------------------------


@respx.mock
def test_a_founder_subscribes_to_empresa_paying_only_the_difference(user):
    founder(user)
    route = mock_create(35000)

    response = client_for(user).post(
        SUBSCRIBE, {"plan": "empresa", "currency": "ARS", "acepta_terminos": True}, format="json"
    )

    assert response.status_code == 201
    assert response.json() == {"checkout_url": preapproval()["init_point"]}
    sent = json.loads(route.calls.last.request.content)
    assert sent["auto_recurring"]["transaction_amount"] == 35000
    assert sent["reason"] == "Gaucho Weather · plan Empresa"
    assert sent["external_reference"] == f"gw-user-{user.pk}-empresa"
    sub = ProviderSubscription.objects.get()
    assert (sub.plan_id, sub.status, sub.amount) == ("empresa", "pending", 35000)
    user.refresh_from_db()
    # Nothing changes until Mercado Pago authorizes it.
    assert (user.plan_id, user.founder_number, user.plan_expires_at) == ("productor", 7, None)


@respx.mock
def test_a_founder_subscribing_twice_reuses_the_checkout_at_the_difference(user):
    founder(user)
    route = mock_create(35000)
    client = client_for(user)

    first = client.post(
        SUBSCRIBE, {"plan": "empresa", "currency": "ARS", "acepta_terminos": True}, format="json"
    )
    second = client.post(
        SUBSCRIBE, {"plan": "empresa", "currency": "ARS", "acepta_terminos": True}, format="json"
    )

    assert first.status_code == second.status_code == 201
    assert second.json() == first.json()
    assert route.call_count == 1
    assert ProviderSubscription.objects.count() == 1


@respx.mock
def test_a_founder_checkout_at_the_full_price_is_not_reused(user):
    founder(user)
    old = empresa_subscription(user, amount=49900)
    cancel = respx.put(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status="cancelled"))
    )
    respx.post(f"{API}/preapproval").mock(
        return_value=httpx.Response(
            201, json=preapproval(amount=35000, external_id="new-preapproval")
        )
    )

    response = client_for(user).post(
        SUBSCRIBE, {"plan": "empresa", "currency": "ARS", "acepta_terminos": True}, format="json"
    )

    assert response.status_code == 201
    assert cancel.called
    old.refresh_from_db()
    assert (old.status, old.ended_at is not None) == ("cancelled", True)
    assert ProviderSubscription.objects.get(external_id="new-preapproval").amount == 35000


@respx.mock
def test_a_founder_still_cannot_subscribe_to_productor(user):
    founder(user)
    route = mock_create(14900)

    response = client_for(user).post(
        SUBSCRIBE, {"plan": "productor", "currency": "ARS", "acepta_terminos": True}, format="json"
    )

    assert response.status_code == 400
    assert response.json() == {"detail": FOUNDER_IS_FREE}
    assert not route.called
    assert not ProviderSubscription.objects.exists()


@pytest.mark.parametrize(
    ("productor", "empresa"),
    [(49900, 49900), (60000, 49900), (None, 49900), (14900, None)],
    ids=["zero-difference", "negative-difference", "no-productor-price", "no-empresa-price"],
)
@respx.mock
def test_a_founder_is_refused_when_the_difference_is_not_positive(user, productor, empresa):
    founder(user)
    Plan.objects.filter(code=Plan.PRODUCTOR).update(price_ars_month=productor)
    Plan.objects.filter(code=Plan.EMPRESA).update(price_ars_month=empresa)
    route = mock_create(35000)

    response = client_for(user).post(
        SUBSCRIBE, {"plan": "empresa", "currency": "ARS", "acepta_terminos": True}, format="json"
    )

    assert response.status_code == 409
    assert response.json() == {"detail": NO_ARS_PRICE}
    assert not route.called
    assert not ProviderSubscription.objects.exists()


@respx.mock
def test_a_non_founder_still_pays_the_full_empresa_price(user):
    route = mock_create(49900)

    response = client_for(user).post(
        SUBSCRIBE, {"plan": "empresa", "currency": "ARS", "acepta_terminos": True}, format="json"
    )

    assert response.status_code == 201
    assert (
        json.loads(route.calls.last.request.content)["auto_recurring"]["transaction_amount"]
        == 49900
    )
    assert ProviderSubscription.objects.get().amount == 49900


def test_the_plans_say_what_a_founder_pays_for_empresa(api_client):
    body = api_client.get(PLANS).json()

    assert body["founder_empresa_price_ars"] == 35000


def test_the_founder_price_is_null_while_it_is_not_positive(api_client):
    Plan.objects.filter(code=Plan.EMPRESA).update(price_ars_month=None)

    assert api_client.get(PLANS).json()["founder_empresa_price_ars"] is None


# --- SF2: authorized ------------------------------------------------------------------------


@respx.mock
def test_authorized_moves_a_founder_to_empresa_and_keeps_the_founder_number(user):
    founder(user)
    empresa_subscription(user)
    mock_read("authorized")

    assert notify("subscription_preapproval", PREAPPROVAL_ID).status_code == 200

    user.refresh_from_db()
    assert (user.plan_id, user.founder_number, user.plan_expires_at) == ("empresa", 7, None)
    change = PlanChange.objects.get(user=user)
    assert (change.from_plan_id, change.to_plan_id, change.reason) == (
        "productor",
        "empresa",
        "payment",
    )


# --- SF3: the end of the paid month ---------------------------------------------------------


@pytest.mark.parametrize(
    ("number", "back_to"), [(7, "productor"), (None, "basico")], ids=["founder", "non-founder"]
)
@pytest.mark.parametrize("stopped", ["cancelled", "paused"])
@time_machine.travel(NOW, tick=False)
@respx.mock
def test_when_the_paid_month_is_over_a_founder_goes_back_to_productor(
    user, number, back_to, stopped
):
    User.objects.filter(pk=user.pk).update(plan_id=Plan.EMPRESA, founder_number=number)
    empresa_subscription(user, status="authorized", next_payment_at=NEXT)
    mock_read(stopped, next_payment=None)

    notify("subscription_preapproval", PREAPPROVAL_ID)

    user.refresh_from_db()
    assert user.plan_id == "empresa"  # the paid month is kept
    with time_machine.travel(NEXT + timedelta(minutes=1), tick=False):
        assert tasks.end_cancelled_subscriptions() == 1
        assert tasks.end_cancelled_subscriptions() == 0

    user.refresh_from_db()
    assert (user.plan_id, user.founder_number, user.plan_expires_at) == (back_to, number, None)
    change = PlanChange.objects.get(user=user, reason="payment_ended")
    assert (change.from_plan_id, change.to_plan_id) == ("empresa", back_to)
    assert ProviderSubscription.objects.get().ended_at is not None


@pytest.mark.parametrize(
    ("number", "back_to"), [(7, "productor"), (None, "basico")], ids=["founder", "non-founder"]
)
@time_machine.travel(NOW, tick=False)
@respx.mock
def test_a_late_cancel_webhook_sends_a_founder_back_to_productor_at_once(user, number, back_to):
    User.objects.filter(pk=user.pk).update(plan_id=Plan.EMPRESA, founder_number=number)
    empresa_subscription(user, status="authorized", next_payment_at=NOW - timedelta(days=1))
    mock_read("cancelled", next_payment=None)

    notify("subscription_preapproval", PREAPPROVAL_ID)

    user.refresh_from_db()
    assert (user.plan_id, user.founder_number) == (back_to, number)
    change = PlanChange.objects.get(user=user)
    assert (change.from_plan_id, change.to_plan_id, change.reason) == (
        "empresa",
        back_to,
        "payment_ended",
    )


# --- SF4: no free Empresa by hand -----------------------------------------------------------


def test_a_founder_cannot_request_empresa(user):
    founder(user)

    response = client_for(user).post(REQUEST, {"kind": "change", "plan": "empresa"}, format="json")

    assert response.status_code == 400
    assert response.json() == {"detail": FOUNDER_PAYS_EMPRESA}
    assert not PlanRequest.objects.exists()


def test_a_non_founder_still_requests_empresa(user):
    response = client_for(user).post(REQUEST, {"kind": "change", "plan": "empresa"}, format="json")

    assert response.status_code == 201
    assert PlanRequest.objects.get().plan_id == "empresa"


def test_a_founder_can_still_ask_for_the_baja(user):
    founder(user)

    response = client_for(user).post(REQUEST, {"kind": "cancel"}, format="json")

    assert response.status_code == 201


def test_the_backoffice_refuses_to_apply_a_founder_request_to_empresa(
    user, admin_client, django_capture_on_commit_callbacks
):
    founder(user)
    request = PlanRequest.objects.create(user=user, kind="change", plan_id=Plan.EMPRESA)

    with django_capture_on_commit_callbacks(execute=True):
        response = admin_client.post(f"{BACKOFFICE}pedidos/{request.pk}/aplicar/", format="json")

    assert response.status_code == 400
    assert response.json() == {"detail": FOUNDER_PAYS_EMPRESA}
    request.refresh_from_db()
    user.refresh_from_db()
    assert request.status == "pending"
    assert (user.plan_id, user.founder_number) == ("productor", 7)
    assert not PlanChange.objects.filter(user=user).exists()
    assert not BackofficeAction.objects.exists()
    assert mail.outbox == []


def test_the_backoffice_refuses_to_move_a_founder_to_empresa(user, admin_client):
    founder(user)

    response = admin_client.post(
        f"{BACKOFFICE}cuentas/{user.pk}/plan/", {"plan": "empresa"}, format="json"
    )

    assert response.status_code == 400
    assert response.json() == {"detail": FOUNDER_PAYS_EMPRESA}
    user.refresh_from_db()
    assert user.plan_id == "productor"
    assert not PlanChange.objects.filter(user=user).exists()
    assert not BackofficeAction.objects.exists()


def test_the_backoffice_still_moves_a_founder_back_to_productor(user, admin_client):
    founder(user, plan=Plan.EMPRESA)

    response = admin_client.post(
        f"{BACKOFFICE}cuentas/{user.pk}/plan/", {"plan": "productor"}, format="json"
    )

    assert response.status_code == 200
    user.refresh_from_db()
    assert (user.plan_id, user.founder_number) == ("productor", 7)
    assert PlanChange.objects.get(user=user).reason == "staff"
    assert BackofficeAction.objects.get().action == "plan_change"


def test_the_backoffice_still_applies_a_founder_request_back_to_productor(user, admin_client):
    founder(user, plan=Plan.EMPRESA)
    request = PlanRequest.objects.create(user=user, kind="change", plan_id=Plan.PRODUCTOR)

    response = admin_client.post(f"{BACKOFFICE}pedidos/{request.pk}/aplicar/", format="json")

    assert response.status_code == 200
    user.refresh_from_db()
    assert (user.plan_id, user.founder_number) == ("productor", 7)
    assert PlanChange.objects.get(user=user).reason == "request"
    assert BackofficeAction.objects.get().action == "request_apply"


class TestDjangoAdmin:
    """SF4 also holds in the Django admin: no free Empresa for a founder, and no 500."""

    @pytest.fixture
    def staff_client(self, db):
        from rest_framework.test import APIClient

        staff = User.objects.create_superuser(
            email="staff@example.com", password=PASSWORD, name="S"
        )
        client = APIClient()
        client.force_login(staff)
        return client

    def test_applying_a_founder_request_to_empresa_is_skipped_with_a_message(
        self, user, staff_client
    ):
        founder(user)
        request = PlanRequest.objects.create(user=user, kind="change", plan_id=Plan.EMPRESA)

        response = staff_client.post(
            "/api/admin/accounts/planrequest/",
            {"action": "apply_requests", "_selected_action": [request.pk]},
            follow=True,
        )

        assert response.status_code == 200
        assert FOUNDER_PAYS_EMPRESA in response.content.decode()
        user.refresh_from_db()
        request.refresh_from_db()
        assert (user.plan_id, request.status) == (Plan.PRODUCTOR, "pending")
        assert not PlanChange.objects.filter(user=user).exists()

    @pytest.mark.parametrize("is_founder", [True, False])
    def test_editing_the_plan_on_the_form_changes_nothing(self, user, staff_client, is_founder):
        """The plan is read-only in the admin (cortesias S6): Empresa never comes from there,
        for a founder or anyone else."""
        from .test_subscription import change_form_data

        if is_founder:
            founder(user)
        before = user.plan_id
        url = f"/api/admin/accounts/user/{user.pk}/change/"
        data = change_form_data(staff_client.get(url))
        data["plan"] = Plan.EMPRESA

        response = staff_client.post(url, data)

        assert response.status_code == 302
        user.refresh_from_db()
        assert user.plan_id == before
        assert not PlanChange.objects.filter(user=user).exists()
