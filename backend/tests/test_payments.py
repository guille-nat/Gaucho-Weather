"""Mercado Pago subscriptions in pesos (pagos-backoffice S2, S3, S5).

Every Mercado Pago call is mocked with respx: the tests never reach the real API.
"""

import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest
import respx
import time_machine
from rest_framework.test import APIClient

from apps.accounts import plans
from apps.accounts.models import Plan, PlanChange, PlanRequest, User
from apps.payments import tasks
from apps.payments.models import Payment, ProviderSubscription

from .conftest import PASSWORD

pytestmark = pytest.mark.django_db

API = "https://api.mercadopago.test"
SECRET = "webhook-secret"
SUBSCRIBE = "/api/pagos/suscribirme/"
CANCEL = "/api/pagos/cancelar/"
MINE = "/api/pagos/"
WEBHOOK = "/api/pagos/mercadopago/webhook/"
PLANS = "/api/planes/"
NOW = datetime(2026, 11, 17, 12, tzinfo=UTC)
NEXT = NOW + timedelta(days=30)
PREAPPROVAL_ID = "2c938084726fca480172750000000000"


@pytest.fixture(autouse=True)
def mercadopago(settings):
    settings.MERCADOPAGO_ACCESS_TOKEN = "TEST-access-token"
    settings.MERCADOPAGO_WEBHOOK_SECRET = SECRET
    settings.MERCADOPAGO_API_URL = API
    Plan.objects.filter(code=Plan.BASICO).update(price_ars_month=0, price_usd_month=0)
    Plan.objects.filter(code=Plan.PRODUCTOR).update(price_ars_month=14900, price_usd_month=10)
    Plan.objects.filter(code=Plan.EMPRESA).update(price_ars_month=49900, price_usd_month=35)


def client_for(user):
    client = APIClient()
    client.force_login(user)
    return client


def on_plan(user, code, expires_at=None):
    User.objects.filter(pk=user.pk).update(plan_id=code, plan_expires_at=expires_at)
    user.refresh_from_db()
    return user


def preapproval(status="pending", amount=14900, next_payment=NEXT, external_id=PREAPPROVAL_ID):
    return {
        "id": external_id,
        "status": status,
        "init_point": f"https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id={external_id}",
        "external_reference": "gw-user-1-productor",
        "next_payment_date": next_payment.isoformat() if next_payment else None,
        "auto_recurring": {
            "frequency": 1,
            "frequency_type": "months",
            "transaction_amount": amount,
            "currency_id": "ARS",
        },
    }


def mp_payment(payment_id="9001", status="approved", preapproval_id=PREAPPROVAL_ID):
    return {
        "id": int(payment_id),
        "status": status,
        "transaction_amount": 14900,
        "currency_id": "ARS",
        "date_approved": NOW.isoformat() if status == "approved" else None,
        "metadata": {"preapproval_id": preapproval_id},
        "payer": {"email": "ana@example.com"},
    }


def subscription(user, plan=Plan.PRODUCTOR, status="pending", next_payment_at=None):
    return ProviderSubscription.objects.create(
        user=user,
        plan_id=plan,
        provider="mercadopago",
        currency="ARS",
        amount=14900,
        external_id=PREAPPROVAL_ID,
        status=status,
        checkout_url="https://www.mercadopago.com.ar/subscriptions/checkout",
        next_payment_at=next_payment_at,
    )


def sign(data_id, request_id="req-1", ts="1742505638683", secret=SECRET):
    manifest = f"id:{data_id.lower()};request-id:{request_id};ts:{ts};"
    digest = hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
    return {"HTTP_X_SIGNATURE": f"ts={ts},v1={digest}", "HTTP_X_REQUEST_ID": request_id}


def notify(topic, data_id, headers=None):
    body = {"type": topic, "action": "updated", "data": {"id": data_id}}
    return APIClient().post(
        f"{WEBHOOK}?data.id={data_id}&type={topic}",
        data=json.dumps(body),
        content_type="application/json",
        **(sign(data_id) if headers is None else headers),
    )


# --- POST /api/pagos/suscribirme/ ----------------------------------------------------------


@respx.mock
def test_subscribing_creates_a_pending_preapproval_and_returns_the_checkout_url(user):
    route = respx.post(f"{API}/preapproval").mock(
        return_value=httpx.Response(201, json=preapproval())
    )

    response = client_for(user).post(
        SUBSCRIBE, {"plan": "productor", "currency": "ARS", "acepta_terminos": True}, format="json"
    )

    assert response.status_code == 201
    assert response.json() == {"checkout_url": preapproval()["init_point"]}
    sent = json.loads(route.calls.last.request.content)
    assert route.calls.last.request.headers["Authorization"] == "Bearer TEST-access-token"
    assert sent["payer_email"] == "ana@example.com"
    assert sent["status"] == "pending"
    assert sent["back_url"] == "https://clima.example.com/perfil/suscripcion?pago=ok"
    assert sent["external_reference"] == f"gw-user-{user.pk}-productor"
    assert sent["auto_recurring"] == {
        "frequency": 1,
        "frequency_type": "months",
        "transaction_amount": 14900,
        "currency_id": "ARS",
    }
    sub = ProviderSubscription.objects.get()
    assert (sub.user, sub.plan_id, sub.status, sub.amount, sub.currency, sub.provider) == (
        user,
        "productor",
        "pending",
        14900,
        "ARS",
        "mercadopago",
    )
    assert sub.external_id == PREAPPROVAL_ID
    user.refresh_from_db()
    assert user.plan_id == "basico"  # nothing changes until Mercado Pago authorizes it


@respx.mock
def test_subscribing_twice_to_the_same_plan_reuses_the_pending_checkout(user):
    route = respx.post(f"{API}/preapproval").mock(
        return_value=httpx.Response(201, json=preapproval())
    )
    client = client_for(user)

    first = client.post(
        SUBSCRIBE, {"plan": "productor", "currency": "ARS", "acepta_terminos": True}, format="json"
    )
    second = client.post(
        SUBSCRIBE, {"plan": "productor", "currency": "ARS", "acepta_terminos": True}, format="json"
    )

    assert first.status_code == second.status_code == 201
    assert second.json() == first.json()
    assert route.call_count == 1  # one preapproval: the payer cannot authorize two
    assert ProviderSubscription.objects.count() == 1


@respx.mock
def test_subscribing_to_another_plan_cancels_the_pending_checkout(user):
    old = subscription(user, plan=Plan.EMPRESA)
    cancel = respx.put(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status="cancelled"))
    )
    respx.post(f"{API}/preapproval").mock(
        return_value=httpx.Response(201, json=preapproval(external_id="new-preapproval"))
    )

    response = client_for(user).post(
        SUBSCRIBE, {"plan": "productor", "currency": "ARS", "acepta_terminos": True}, format="json"
    )

    assert response.status_code == 201
    assert json.loads(cancel.calls.last.request.content) == {"status": "cancelled"}
    old.refresh_from_db()
    assert old.status == "cancelled"
    assert old.ended_at is not None
    new = ProviderSubscription.objects.get(external_id="new-preapproval")
    assert (new.plan_id, new.status) == ("productor", "pending")
    user.refresh_from_db()
    assert user.plan_id == "basico"


@respx.mock
def test_subscribing_when_the_old_checkout_cannot_be_cancelled_is_502(user):
    subscription(user, plan=Plan.EMPRESA)
    respx.put(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(return_value=httpx.Response(500))
    create = respx.post(f"{API}/preapproval")

    response = client_for(user).post(
        SUBSCRIBE, {"plan": "productor", "currency": "ARS", "acepta_terminos": True}, format="json"
    )

    assert response.status_code == 502
    assert response.json() == {
        "detail": "No pudimos conectar con Mercado Pago. Probá de nuevo en un rato."
    }
    assert not create.called
    assert ProviderSubscription.objects.get().status == "pending"


@respx.mock
def test_a_cancelled_old_checkout_stays_cancelled_when_the_new_one_fails(user):
    old = subscription(user, plan=Plan.EMPRESA)
    respx.put(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status="cancelled"))
    )
    respx.post(f"{API}/preapproval").mock(return_value=httpx.Response(500))

    response = client_for(user).post(
        SUBSCRIBE, {"plan": "productor", "currency": "ARS", "acepta_terminos": True}, format="json"
    )

    assert response.status_code == 502
    old.refresh_from_db()
    assert old.status == "cancelled"  # it is dead at Mercado Pago: never offer it again
    assert old.ended_at is not None
    assert ProviderSubscription.objects.count() == 1


def test_subscribing_needs_a_session(api_client):
    response = api_client.post(
        SUBSCRIBE, {"plan": "productor", "currency": "ARS", "acepta_terminos": True}, format="json"
    )

    assert response.status_code == 403


@pytest.mark.parametrize(
    ("setup", "body", "status", "detail"),
    [
        (
            None,
            {"plan": "basico", "currency": "ARS", "acepta_terminos": True},
            400,
            "El plan Básico es gratis: no hace falta suscribirse.",
        ),
        (
            "productor",
            {"plan": "productor", "currency": "ARS", "acepta_terminos": True},
            400,
            "Ya estás en el plan Productor.",
        ),
        (
            "founder",
            {"plan": "productor", "currency": "ARS", "acepta_terminos": True},
            400,
            "Como founder ya tenés Productor gratis para siempre.",
        ),
        (
            None,
            {"plan": "oro", "currency": "ARS", "acepta_terminos": True},
            400,
            "Ese plan no existe.",
        ),
        (
            None,
            {"plan": "productor", "currency": "USD", "acepta_terminos": True},
            409,
            "Pagar en dólares todavía no está disponible.",
        ),
        (
            "no_price",
            {"plan": "empresa", "currency": "ARS", "acepta_terminos": True},
            409,
            "Ese plan todavía no tiene precio en pesos.",
        ),
        (
            "authorized",
            {"plan": "empresa", "currency": "ARS", "acepta_terminos": True},
            400,
            "Ya tenés una suscripción activa. Date de baja antes de cambiar de plan.",
        ),
    ],
)
@respx.mock
def test_subscribing_refusals(user, setup, body, status, detail):
    route = respx.post(f"{API}/preapproval").mock(
        return_value=httpx.Response(201, json=preapproval())
    )
    if setup == "productor":
        on_plan(user, Plan.PRODUCTOR)
    elif setup == "founder":
        User.objects.filter(pk=user.pk).update(plan_id=Plan.PRODUCTOR, founder_number=7)
    elif setup == "no_price":
        Plan.objects.filter(code=Plan.EMPRESA).update(price_ars_month=None)
    elif setup == "authorized":
        on_plan(user, Plan.PRODUCTOR)
        subscription(user, status="authorized")
    before = ProviderSubscription.objects.count()

    response = client_for(user).post(SUBSCRIBE, body, format="json")

    assert response.status_code == status
    assert response.json() == {"detail": detail}
    assert not route.called
    assert ProviderSubscription.objects.count() == before


@respx.mock
def test_a_trial_user_may_subscribe_to_keep_productor(user):
    on_plan(user, Plan.PRODUCTOR, expires_at=NOW + timedelta(days=10))
    respx.post(f"{API}/preapproval").mock(return_value=httpx.Response(201, json=preapproval()))

    response = client_for(user).post(
        SUBSCRIBE, {"plan": "productor", "currency": "ARS", "acepta_terminos": True}, format="json"
    )

    assert response.status_code == 201


@respx.mock
def test_subscribing_when_payments_are_not_configured_is_503(user, settings):
    settings.MERCADOPAGO_ACCESS_TOKEN = ""
    route = respx.post(f"{API}/preapproval")

    response = client_for(user).post(
        SUBSCRIBE, {"plan": "productor", "currency": "ARS", "acepta_terminos": True}, format="json"
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "Los pagos todavía no están habilitados."}
    assert not route.called


@respx.mock
def test_subscribing_when_mercadopago_fails_is_502_and_records_nothing(user):
    respx.post(f"{API}/preapproval").mock(return_value=httpx.Response(500, json={}))

    response = client_for(user).post(
        SUBSCRIBE, {"plan": "productor", "currency": "ARS", "acepta_terminos": True}, format="json"
    )

    assert response.status_code == 502
    assert response.json() == {
        "detail": "No pudimos conectar con Mercado Pago. Probá de nuevo en un rato."
    }
    assert not ProviderSubscription.objects.exists()


# --- POST /api/pagos/mercadopago/webhook/ --------------------------------------------------


@respx.mock
def test_a_webhook_with_a_non_ascii_signature_is_401(user):
    subscription(user)
    route = respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}")

    response = notify(
        "subscription_preapproval",
        PREAPPROVAL_ID,
        headers={"HTTP_X_SIGNATURE": "ts=1742505638683,v1=ñandú", "HTTP_X_REQUEST_ID": "req-1"},
    )

    assert response.status_code == 401
    assert not route.called


@pytest.mark.parametrize("body", ['{"data": "x"}', '{"data": ["x"]}', '{"data": 7}'])
@respx.mock
def test_an_unsigned_webhook_with_a_malformed_body_is_401(user, body):
    subscription(user)

    response = APIClient(raise_request_exception=False).post(
        WEBHOOK, data=body, content_type="application/json"
    )

    assert response.status_code == 401
    assert ProviderSubscription.objects.get().status == "pending"


@respx.mock
def test_a_signed_webhook_with_an_odd_type_is_acknowledged_and_ignored(user):
    subscription(user)
    route = respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}")

    response = APIClient(raise_request_exception=False).post(
        f"{WEBHOOK}?data.id={PREAPPROVAL_ID}",
        data=json.dumps({"type": ["payment"], "data": {"id": PREAPPROVAL_ID}}),
        content_type="application/json",
        **sign(PREAPPROVAL_ID),
    )

    assert response.status_code == 200
    assert not route.called


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"HTTP_X_SIGNATURE": "ts=1742505638683,v1=deadbeef", "HTTP_X_REQUEST_ID": "req-1"},
        sign(PREAPPROVAL_ID, secret="another-secret"),
        sign("other-id"),
    ],
    ids=["missing", "garbage", "wrong-secret", "other-resource"],
)
@respx.mock
def test_a_webhook_with_a_bad_or_missing_signature_is_401(user, headers):
    subscription(user)
    route = respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}")

    response = notify("subscription_preapproval", PREAPPROVAL_ID, headers=headers)

    assert response.status_code == 401
    assert not route.called
    assert ProviderSubscription.objects.get().status == "pending"


@respx.mock
def test_authorized_applies_the_plan_and_ends_a_trial(user):
    on_plan(user, Plan.PRODUCTOR, expires_at=NOW + timedelta(days=5))
    subscription(user)
    route = respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status="authorized"))
    )

    response = notify("subscription_preapproval", PREAPPROVAL_ID)

    assert response.status_code == 200
    assert route.called  # the state comes from the API, not from the body
    user.refresh_from_db()
    assert (user.plan_id, user.plan_expires_at) == ("productor", None)
    assert plans.membership_status(user) == "active"
    sub = ProviderSubscription.objects.get()
    assert (sub.status, sub.next_payment_at) == ("authorized", NEXT)
    change = user.plan_changes.first()
    assert (change.reason, change.to_plan_id) == ("payment", "productor")


@respx.mock
def test_authorized_moves_a_basico_user_up(user):
    subscription(user, plan=Plan.EMPRESA)
    respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status="authorized", amount=49900))
    )

    notify("subscription_preapproval", PREAPPROVAL_ID)

    user.refresh_from_db()
    assert user.plan_id == "empresa"
    assert PlanChange.objects.get(user=user, reason="payment").from_plan_id == "basico"


@respx.mock
def test_a_repeated_webhook_changes_nothing_twice(user):
    subscription(user)
    respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status="authorized"))
    )
    respx.get(f"{API}/v1/payments/9001").mock(return_value=httpx.Response(200, json=mp_payment()))

    for _ in range(2):
        assert notify("subscription_preapproval", PREAPPROVAL_ID).status_code == 200
        assert notify("payment", "9001").status_code == 200

    assert PlanChange.objects.filter(user=user, reason="payment").count() == 1
    assert Payment.objects.count() == 1


@respx.mock
def test_an_unknown_preapproval_is_acknowledged_and_ignored(user):
    respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status="authorized"))
    )

    response = notify("subscription_preapproval", PREAPPROVAL_ID)

    assert response.status_code == 200
    user.refresh_from_db()
    assert user.plan_id == "basico"


@respx.mock
def test_a_webhook_is_retried_when_mercadopago_cannot_be_read(user):
    subscription(user)
    respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(return_value=httpx.Response(500))

    response = notify("subscription_preapproval", PREAPPROVAL_ID)

    assert response.status_code == 502
    assert ProviderSubscription.objects.get().status == "pending"


@time_machine.travel(NOW, tick=False)
@respx.mock
def test_cancelled_keeps_the_plan_until_the_period_end_then_basico(user):
    on_plan(user, Plan.PRODUCTOR)
    subscription(user, status="authorized", next_payment_at=NEXT)
    respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status="cancelled"))
    )

    notify("subscription_preapproval", PREAPPROVAL_ID)

    user.refresh_from_db()
    sub = ProviderSubscription.objects.get()
    assert (sub.status, sub.next_payment_at, sub.ended_at) == ("cancelled", NEXT, None)
    assert user.plan_id == "productor"
    assert tasks.end_cancelled_subscriptions() == 0  # the paid month is not over yet

    with time_machine.travel(NEXT + timedelta(minutes=1), tick=False):
        assert tasks.end_cancelled_subscriptions() == 1
        assert tasks.end_cancelled_subscriptions() == 0  # idempotent

    user.refresh_from_db()
    assert user.plan_id == "basico"
    assert PlanChange.objects.filter(user=user, reason="payment_ended").count() == 1
    assert ProviderSubscription.objects.get().ended_at is not None


# --- A paused subscription is treated like a cancelled one (S8) --------------------------------


@time_machine.travel(NOW, tick=False)
@respx.mock
def test_paused_keeps_the_plan_until_the_period_end_then_basico(user):
    on_plan(user, Plan.PRODUCTOR)
    subscription(user, status="authorized", next_payment_at=NEXT)
    # Mercado Pago may drop next_payment_date on a paused preapproval: the stored one counts.
    respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status="paused", next_payment=None))
    )

    notify("subscription_preapproval", PREAPPROVAL_ID)

    user.refresh_from_db()
    sub = ProviderSubscription.objects.get()
    assert (sub.status, sub.next_payment_at, sub.ended_at) == ("paused", NEXT, None)
    assert user.plan_id == "productor"
    assert client_for(user).get(MINE).json()["subscription"]["ends_at"] is not None
    assert tasks.end_cancelled_subscriptions() == 0

    with time_machine.travel(NEXT + timedelta(minutes=1), tick=False):
        assert tasks.end_cancelled_subscriptions() == 1
        assert tasks.end_cancelled_subscriptions() == 0

    user.refresh_from_db()
    assert user.plan_id == "basico"
    assert PlanChange.objects.filter(user=user, reason="payment_ended").count() == 1


@time_machine.travel(NOW, tick=False)
@respx.mock
def test_paused_with_no_period_left_moves_to_basico_at_once(user):
    on_plan(user, Plan.PRODUCTOR)
    subscription(user, status="authorized", next_payment_at=NOW - timedelta(days=1))
    respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status="paused", next_payment=None))
    )

    notify("subscription_preapproval", PREAPPROVAL_ID)

    user.refresh_from_db()
    assert user.plan_id == "basico"
    assert ProviderSubscription.objects.get().ended_at is not None


@time_machine.travel(NOW, tick=False)
@respx.mock
def test_a_paused_subscription_resumed_after_it_ended_gives_the_plan_back(user):
    on_plan(user, Plan.BASICO)
    subscription(user, status="paused", next_payment_at=NOW - timedelta(days=1))
    ProviderSubscription.objects.update(ended_at=NOW - timedelta(hours=1))
    respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status="authorized"))
    )

    notify("subscription_preapproval", PREAPPROVAL_ID)

    user.refresh_from_db()
    sub = ProviderSubscription.objects.get()
    assert (sub.status, sub.ended_at) == ("authorized", None)
    assert user.plan_id == "productor"


@time_machine.travel(NOW, tick=False)
@respx.mock
def test_a_cancelled_subscription_that_ended_stays_ended(user):
    on_plan(user, Plan.BASICO)
    subscription(user, status="cancelled", next_payment_at=NOW - timedelta(days=1))
    ProviderSubscription.objects.update(ended_at=NOW - timedelta(hours=1))
    respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status="authorized"))
    )

    notify("subscription_preapproval", PREAPPROVAL_ID)

    user.refresh_from_db()
    assert user.plan_id == "basico"


@time_machine.travel(NOW, tick=False)
@respx.mock
def test_subscribing_again_cancels_an_ended_paused_subscription_first(user):
    subscription(user, status="paused", next_payment_at=NOW - timedelta(days=1))
    ProviderSubscription.objects.update(ended_at=NOW - timedelta(hours=1))
    cancel = respx.put(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status="cancelled"))
    )
    respx.post(f"{API}/preapproval").mock(
        return_value=httpx.Response(201, json=preapproval(external_id="new-preapproval"))
    )

    response = client_for(user).post(
        SUBSCRIBE, {"plan": "productor", "currency": "ARS", "acepta_terminos": True}, format="json"
    )

    assert response.status_code == 201
    assert cancel.called  # a resumed old one would charge twice
    assert ProviderSubscription.objects.get(external_id=PREAPPROVAL_ID).status == "cancelled"


@time_machine.travel(NOW, tick=False)
@respx.mock
def test_cancelled_with_no_period_left_moves_to_basico_at_once(user):
    on_plan(user, Plan.PRODUCTOR)
    subscription(user, status="authorized")
    respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status="cancelled", next_payment=None))
    )

    notify("subscription_preapproval", PREAPPROVAL_ID)

    user.refresh_from_db()
    assert user.plan_id == "basico"
    assert user.plan_changes.first().reason == "payment_ended"


@respx.mock
def test_a_checkout_cancelled_before_paying_leaves_the_trial_alone(user):
    trial_end = NOW + timedelta(days=10)
    on_plan(user, Plan.PRODUCTOR, expires_at=trial_end)
    subscription(user, status="pending")
    respx.get(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status="cancelled", next_payment=None))
    )

    notify("subscription_preapproval", PREAPPROVAL_ID)

    user.refresh_from_db()
    assert (user.plan_id, user.plan_expires_at) == ("productor", trial_end)
    assert tasks.end_cancelled_subscriptions() == 0


@respx.mock
def test_a_payment_event_upserts_the_payment(user):
    on_plan(user, Plan.PRODUCTOR)
    sub = subscription(user, status="authorized")
    route = respx.get(f"{API}/v1/payments/9001")
    route.mock(return_value=httpx.Response(200, json=mp_payment(status="pending")))
    notify("payment", "9001")
    route.mock(return_value=httpx.Response(200, json=mp_payment(status="approved")))

    notify("payment", "9001")

    payment = Payment.objects.get()
    assert (payment.user, payment.subscription, payment.status) == (user, sub, "approved")
    assert (payment.amount, payment.currency, payment.paid_at) == (14900, "ARS", NOW)
    assert payment.external_id == "9001"
    assert payment.payload["status"] == "approved"


@respx.mock
def test_a_rejected_payment_does_not_downgrade(user):
    on_plan(user, Plan.PRODUCTOR)
    subscription(user, status="authorized")
    respx.get(f"{API}/v1/payments/9002").mock(
        return_value=httpx.Response(200, json=mp_payment("9002", status="rejected"))
    )

    response = notify("payment", "9002")

    assert response.status_code == 200
    assert Payment.objects.get().status == "rejected"
    user.refresh_from_db()
    assert user.plan_id == "productor"
    assert not PlanChange.objects.filter(user=user).exists()


@respx.mock
def test_an_authorized_payment_event_links_the_invoice_payment(user):
    sub = subscription(user, status="authorized")
    respx.get(f"{API}/authorized_payments/555").mock(
        return_value=httpx.Response(
            200,
            json={"id": 555, "preapproval_id": PREAPPROVAL_ID, "payment": {"id": 9003}},
        )
    )
    respx.get(f"{API}/v1/payments/9003").mock(
        return_value=httpx.Response(200, json=mp_payment("9003", preapproval_id=None))
    )

    response = notify("subscription_authorized_payment", "555")

    assert response.status_code == 200
    assert Payment.objects.get().subscription == sub


@respx.mock
def test_a_payment_that_matches_no_account_is_ignored():
    respx.get(f"{API}/v1/payments/9004").mock(
        return_value=httpx.Response(200, json=mp_payment("9004", preapproval_id="unknown"))
    )

    response = notify("payment", "9004")

    assert response.status_code == 200
    assert not Payment.objects.exists()


def test_the_webhook_is_503_when_payments_are_not_configured(settings):
    settings.MERCADOPAGO_WEBHOOK_SECRET = ""

    response = notify("payment", "9001")

    assert response.status_code == 503


# --- GET /api/pagos/ and POST /api/pagos/cancelar/ -----------------------------------------


def test_my_payments_shows_the_subscription_and_the_payments(user):
    on_plan(user, Plan.PRODUCTOR)
    sub = subscription(user, status="authorized", next_payment_at=NEXT)
    Payment.objects.create(
        user=user,
        subscription=sub,
        provider="mercadopago",
        external_id="9001",
        amount=14900,
        currency="ARS",
        status="approved",
        paid_at=NOW,
        payload={"secret": "never shown"},
    )

    body = client_for(user).get(MINE).json()

    assert body["payments_enabled"] is True
    assert body["subscription"] == {
        "id": sub.pk,
        "plan": "productor",
        "plan_name": "Productor",
        "provider": "mercadopago",
        "currency": "ARS",
        "amount": 14900,
        "status": "authorized",
        "next_payment_at": "2026-12-17T09:00:00-03:00",
        "ends_at": None,
        "created_at": body["subscription"]["created_at"],
    }
    assert body["payments"] == [
        {
            "id": Payment.objects.get().pk,
            "amount": 14900,
            "currency": "ARS",
            "status": "approved",
            "paid_at": "2026-11-17T09:00:00-03:00",
            "created_at": body["payments"][0]["created_at"],
        }
    ]


def test_my_payments_without_a_subscription(user):
    body = client_for(user).get(MINE).json()

    assert body == {"payments_enabled": True, "subscription": None, "payments": []}


@time_machine.travel(NOW, tick=False)
@respx.mock
def test_cancelling_cancels_at_mercadopago_and_keeps_the_paid_month(user):
    on_plan(user, Plan.PRODUCTOR)
    subscription(user, status="authorized", next_payment_at=NEXT)
    route = respx.put(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status="cancelled"))
    )

    response = client_for(user).post(CANCEL)

    assert response.status_code == 200
    assert json.loads(route.calls.last.request.content) == {"status": "cancelled"}
    assert response.json()["subscription"]["status"] == "cancelled"
    assert response.json()["subscription"]["ends_at"] == "2026-12-17T09:00:00-03:00"
    user.refresh_from_db()
    assert user.plan_id == "productor"


def test_cancelling_without_a_provider_subscription_is_404(user):
    response = client_for(user).post(CANCEL)

    assert response.status_code == 404
    assert response.json() == {"detail": "No tenés una suscripción con Mercado Pago."}


@respx.mock
def test_cancelling_when_mercadopago_fails_is_502(user):
    subscription(user, status="authorized", next_payment_at=NEXT)
    respx.put(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(return_value=httpx.Response(500))

    response = client_for(user).post(CANCEL)

    assert response.status_code == 502
    assert ProviderSubscription.objects.get().status == "authorized"


# --- deleting the account cancels at Mercado Pago first -------------------------------------

ME = "/api/auth/me/"


@respx.mock
@pytest.mark.parametrize("status", ["pending", "authorized", "paused"])
def test_deleting_the_account_cancels_its_subscription_at_mercadopago(user, status):
    subscription(user, status=status, next_payment_at=NEXT)
    route = respx.put(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(
        return_value=httpx.Response(200, json=preapproval(status="cancelled"))
    )

    response = client_for(user).delete(ME, {"password": PASSWORD}, format="json")

    assert response.status_code == 204
    assert json.loads(route.calls.last.request.content) == {"status": "cancelled"}
    assert not User.objects.filter(pk=user.pk).exists()
    assert ProviderSubscription.objects.count() == 0


@respx.mock
def test_deleting_the_account_skips_a_subscription_already_cancelled(user):
    subscription(user, status="cancelled")
    route = respx.put(f"{API}/preapproval/{PREAPPROVAL_ID}")

    response = client_for(user).delete(ME, {"password": PASSWORD}, format="json")

    assert response.status_code == 204
    assert not route.called
    assert not User.objects.filter(pk=user.pk).exists()


@respx.mock
def test_deleting_the_account_when_mercadopago_fails_is_502_and_keeps_everything(user):
    on_plan(user, Plan.PRODUCTOR)
    subscription(user, status="authorized", next_payment_at=NEXT)
    respx.put(f"{API}/preapproval/{PREAPPROVAL_ID}").mock(return_value=httpx.Response(500))
    client = client_for(user)

    response = client.delete(ME, {"password": PASSWORD}, format="json")

    assert response.status_code == 502
    assert response.json() == {
        "detail": "No pudimos conectar con Mercado Pago. Probá de nuevo en un rato."
    }
    assert User.objects.filter(pk=user.pk).exists()
    assert ProviderSubscription.objects.get().status == "authorized"
    assert client.get(ME).status_code == 200


@respx.mock
def test_deleting_the_account_with_a_wrong_password_does_not_touch_mercadopago(user):
    subscription(user, status="authorized", next_payment_at=NEXT)
    route = respx.put(f"{API}/preapproval/{PREAPPROVAL_ID}")

    response = client_for(user).delete(ME, {"password": "nope"}, format="json")

    assert response.status_code == 400
    assert not route.called
    assert ProviderSubscription.objects.get().status == "authorized"


# --- GET /api/planes/ and the existing request flow ----------------------------------------


def test_plans_says_whether_payments_are_enabled(api_client, settings):
    assert api_client.get(PLANS).json()["payments_enabled"] is True

    settings.MERCADOPAGO_ACCESS_TOKEN = ""

    assert api_client.get(PLANS).json()["payments_enabled"] is False


def test_the_plan_request_cancel_flow_and_the_plans_fields_still_hold(user):
    on_plan(user, Plan.PRODUCTOR)
    client = client_for(user)

    response = client.post("/api/auth/suscripcion/pedido/", {"kind": "cancel"}, format="json")

    assert response.status_code == 201
    assert (response.json()["kind"], response.json()["plan"]) == ("cancel", "basico")
    assert PlanRequest.objects.get().status == "pending"
    body = client.get(PLANS).json()
    assert set(body) == {
        "plans",
        "founders",
        "trial_days",
        "payments_enabled",
        "founder_empresa_price_ars",
    }
    assert set(body["plans"][0]) == {
        "code",
        "name",
        "price_ars_month",
        "price_usd_month",
        "max_lotes",
        "max_alert_rules",
        "allows_push",
        "priority_support",
        "highlighted",
    }
