"""avisos-cambios S3: applying a scheduled price on its date, at Mercado Pago."""

import json
from datetime import timedelta

import httpx
import pytest
import respx
import time_machine

from apps.accounts.models import Plan
from apps.payments import price_changes, tasks
from apps.payments.models import PriceChange, PriceNotice, ProviderSubscription
from apps.payments.services import price_for

from .test_payments import API, preapproval
from .test_price_changes import NOW, subscribed

pytestmark = pytest.mark.django_db

DAY_30 = NOW + timedelta(days=30)  # 2026-12-20, the change's date


@pytest.fixture(autouse=True)
def mercadopago(settings):
    settings.MERCADOPAGO_ACCESS_TOKEN = "TEST-access-token"
    settings.MERCADOPAGO_WEBHOOK_SECRET = "secret"
    settings.MERCADOPAGO_API_URL = API
    Plan.objects.filter(code=Plan.PRODUCTOR).update(price_ars_month=14900, price_usd_month=10)
    Plan.objects.filter(code=Plan.EMPRESA).update(price_ars_month=49900, price_usd_month=35)


def scheduled(price=16900, days=30):
    """Schedule on NOW and send the notices then."""
    with time_machine.travel(NOW, tick=False):
        change = price_changes.schedule(
            None,
            Plan.objects.get(code=Plan.PRODUCTOR),
            price_ars_month=price,
            effective_on=(NOW + timedelta(days=days)).date(),
        )
        price_changes.send_pending_notices()
    return change


def amount_route(sub, amount=16900):
    return respx.put(f"{API}/preapproval/{sub.external_id}").mock(
        return_value=httpx.Response(
            200, json=preapproval(status=sub.status, amount=amount, external_id=sub.external_id)
        )
    )


def run_on(moment):
    with time_machine.travel(moment, tick=False):
        return tasks.apply_price_changes()


@respx.mock
def test_on_its_date_the_new_amount_is_set_at_mercadopago():
    _, ana = subscribed("ana@example.com")
    _, beto = subscribed("beto@example.com", status="paused")
    change = scheduled()
    routes = [amount_route(ana), amount_route(beto)]

    run_on(DAY_30)

    for route in routes:
        assert json.loads(route.calls.last.request.content) == {
            "auto_recurring": {"transaction_amount": 16900, "currency_id": "ARS"}
        }
    for sub in (ana, beto):
        sub.refresh_from_db()
        assert sub.amount == 16900
    assert all(n.applied_at == DAY_30 for n in PriceNotice.objects.all())
    change.refresh_from_db()
    assert change.applied_at == DAY_30


@respx.mock
def test_new_checkouts_pay_the_new_price_from_its_date():
    user, _ = subscribed("ana@example.com", status="cancelled")
    scheduled()
    productor = Plan.objects.get(code=Plan.PRODUCTOR)

    run_on(DAY_30 - timedelta(days=1))
    productor.refresh_from_db()
    assert price_for(user, productor) == 14900

    run_on(DAY_30)
    productor.refresh_from_db()
    assert price_for(user, productor) == 16900


@respx.mock
def test_nothing_changes_the_day_before():
    _, ana = subscribed("ana@example.com")
    change = scheduled()
    route = amount_route(ana)

    run_on(DAY_30 - timedelta(days=1))

    assert not route.called
    ana.refresh_from_db()
    assert ana.amount == 14900
    change.refresh_from_db()
    assert change.applied_at is None


@respx.mock
def test_a_late_notice_waits_30_days_from_its_own_email():
    change = scheduled()
    _, late = subscribed("tarde@example.com")
    with time_machine.travel(NOW + timedelta(days=10), tick=False):
        tasks.price_notices()  # its notice goes out on day 10
    route = amount_route(late)

    run_on(DAY_30)
    assert not route.called

    run_on(NOW + timedelta(days=40))
    assert route.call_count == 1
    late.refresh_from_db()
    assert late.amount == 16900
    change.refresh_from_db()
    assert change.applied_at == DAY_30


@respx.mock
def test_an_unsent_notice_is_never_applied(monkeypatch):
    _, ana = subscribed("ana@example.com")
    with time_machine.travel(NOW, tick=False):
        price_changes.schedule(
            None,
            Plan.objects.get(code=Plan.PRODUCTOR),
            price_ars_month=16900,
            effective_on=DAY_30.date(),
        )  # the email never went out
    route = amount_route(ana)

    run_on(DAY_30 + timedelta(days=60))

    assert not route.called
    ana.refresh_from_db()
    assert ana.amount == 14900


@respx.mock
def test_a_refusal_is_retried_on_the_next_run_and_the_rest_are_applied():
    _, ana = subscribed("ana@example.com")
    _, beto = subscribed("beto@example.com")
    scheduled()
    failing = respx.put(f"{API}/preapproval/{ana.external_id}").mock(
        return_value=httpx.Response(500)
    )
    amount_route(beto)

    run_on(DAY_30)

    ana.refresh_from_db()
    beto.refresh_from_db()
    assert (ana.amount, beto.amount) == (14900, 16900)
    assert PriceNotice.objects.get(subscription=ana).applied_at is None

    failing.mock(
        return_value=httpx.Response(
            200, json=preapproval(status="authorized", amount=16900, external_id=ana.external_id)
        )
    )
    run_on(DAY_30 + timedelta(days=1))

    ana.refresh_from_db()
    assert ana.amount == 16900


@respx.mock
def test_an_answer_without_the_new_amount_counts_as_a_refusal():
    _, ana = subscribed("ana@example.com")
    scheduled()
    amount_route(ana, amount=14900)  # 200, but Mercado Pago kept the old amount

    run_on(DAY_30)

    ana.refresh_from_db()
    assert ana.amount == 14900
    assert PriceNotice.objects.get().applied_at is None


@respx.mock
def test_running_twice_puts_the_amount_once():
    _, ana = subscribed("ana@example.com")
    scheduled()
    route = amount_route(ana)

    run_on(DAY_30)
    run_on(DAY_30 + timedelta(hours=1))

    assert route.call_count == 1


@respx.mock
def test_a_cancelled_change_is_never_applied():
    _, ana = subscribed("ana@example.com")
    scheduled()
    price_changes.cancel(Plan.objects.get(code=Plan.PRODUCTOR))
    route = amount_route(ana)

    run_on(DAY_30)

    assert not route.called
    assert Plan.objects.get(code=Plan.PRODUCTOR).price_ars_month == 14900
    assert PriceChange.objects.get().applied_at is None


@respx.mock
def test_a_subscription_cancelled_meanwhile_is_left_alone():
    _, ana = subscribed("ana@example.com")
    scheduled()
    ProviderSubscription.objects.filter(pk=ana.pk).update(status="cancelled")
    route = amount_route(ana)

    run_on(DAY_30)

    assert not route.called


@respx.mock
def test_founders_on_empresa_get_their_new_difference():
    _, founder = subscribed(
        "fundador@example.com", plan=Plan.EMPRESA, amount=35000, founder_number=7
    )
    scheduled()
    route = amount_route(founder, amount=33000)

    run_on(DAY_30)

    assert json.loads(route.calls.last.request.content)["auto_recurring"] == {
        "transaction_amount": 33000,
        "currency_id": "ARS",
    }
    founder.refresh_from_db()
    assert founder.amount == 33000


@respx.mock
def test_an_older_change_never_overwrites_a_newer_one_already_applied():
    _, ana = subscribed("ana@example.com")
    older = PriceChange.objects.create(
        plan_id=Plan.PRODUCTOR, price_ars_month=15900, effective_on=DAY_30.date(), applied_at=NOW
    )
    newer = PriceChange.objects.create(
        plan_id=Plan.PRODUCTOR, price_ars_month=16900, effective_on=DAY_30.date()
    )
    PriceNotice.objects.create(
        change=older, subscription=ana, old_amount=14900, new_amount=15900, sent_at=NOW
    )
    PriceNotice.objects.create(
        change=newer,
        subscription=ana,
        old_amount=14900,
        new_amount=16900,
        sent_at=NOW,
        applied_at=NOW,
    )
    route = amount_route(ana, amount=15900)

    run_on(DAY_30)

    assert not route.called
