"""avisos-cambios S1, S2: scheduling a price change from the backoffice and its notice email."""

from datetime import UTC, date, datetime

import pytest
import time_machine
from django.core import mail

from apps.accounts.models import Plan, User
from apps.backoffice.models import BackofficeAction
from apps.payments import tasks
from apps.payments.models import PriceChange, PriceNotice, ProviderSubscription

from .test_backoffice import PRICES, account, client_for

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 11, 20, 12, tzinfo=UTC)  # 09:00 in Buenos Aires
IN_30_DAYS = "2026-12-20"
TOO_SOON = "2026-12-19"


@pytest.fixture(autouse=True)
def frozen_clock():
    with time_machine.travel(NOW, tick=False):
        yield


@pytest.fixture(autouse=True)
def prices():
    Plan.objects.filter(code=Plan.PRODUCTOR).update(price_ars_month=14900, price_usd_month=10)
    Plan.objects.filter(code=Plan.EMPRESA).update(price_ars_month=49900, price_usd_month=35)


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(email="jefe@example.com", password="x", name="Jefe")


@pytest.fixture
def admin_client(admin_user):
    return client_for(admin_user)


def subscribed(email, plan=Plan.PRODUCTOR, status="authorized", amount=14900, **fields):
    user = account(email, name=email.split("@")[0].capitalize(), plan_id=plan, **fields)
    sub = ProviderSubscription.objects.create(
        user=user,
        plan_id=plan,
        provider="mercadopago",
        currency="ARS",
        amount=amount,
        external_id=f"pre-{email}",
        status=status,
    )
    return user, sub


def schedule(client, code="productor", price=16900, effective_on=IN_30_DAYS):
    return client.post(
        f"{PRICES}{code}/cambio/",
        {"price_ars_month": price, "effective_on": effective_on},
        format="json",
    )


def change_of(code):
    return {
        "price_ars_month": 16900,
        "effective_on": IN_30_DAYS,
        "notices": 0,
        "notices_sent": 0,
    }


# --- S1: scheduling ------------------------------------------------------------------------


def test_scheduling_saves_the_change_records_it_and_keeps_the_current_price(
    admin_client, admin_user, django_capture_on_commit_callbacks
):
    with django_capture_on_commit_callbacks(execute=True):
        response = schedule(admin_client)

    assert response.status_code == 201
    assert response.json() == {
        "code": "productor",
        "name": "Productor",
        "price_ars_month": 14900,
        "price_usd_month": 10,
        "pending_change": change_of("productor"),
    }
    change = PriceChange.objects.get()
    assert (change.plan_id, change.price_ars_month, change.effective_on) == (
        "productor",
        16900,
        date(2026, 12, 20),
    )
    assert change.created_by == admin_user
    assert Plan.objects.get(code="productor").price_ars_month == 14900
    action = BackofficeAction.objects.get()
    assert (action.actor, action.action) == (admin_user, "price_schedule")
    assert action.payload == {
        "plan": "productor",
        "price_ars_month": 16900,
        "effective_on": IN_30_DAYS,
    }


def test_the_price_list_shows_the_pending_change(admin_client):
    schedule(admin_client)

    plans = {plan["code"]: plan for plan in admin_client.get(PRICES).json()}

    assert plans["productor"]["pending_change"] == change_of("productor")
    assert plans["empresa"]["pending_change"] is None


@pytest.mark.parametrize(
    "body,field,message",
    [
        (
            {"price_ars_month": 16900, "effective_on": TOO_SOON},
            "effective_on",
            "La fecha tiene que ser al menos 30 días después de hoy.",
        ),
        ({"price_ars_month": 16900}, "effective_on", "Este campo es requerido."),
        ({"price_ars_month": 0, "effective_on": IN_30_DAYS}, "price_ars_month", None),
        ({"price_ars_month": None, "effective_on": IN_30_DAYS}, "price_ars_month", None),
        ({"price_ars_month": "mucho", "effective_on": IN_30_DAYS}, "price_ars_month", None),
        ({"effective_on": IN_30_DAYS}, "price_ars_month", "Este campo es requerido."),
    ],
)
def test_scheduling_refusals(admin_client, body, field, message):
    response = admin_client.post(f"{PRICES}productor/cambio/", body, format="json")

    assert response.status_code == 400
    assert field in response.json()
    if message:
        assert response.json()[field] == [message]
    assert not PriceChange.objects.exists()
    assert not BackofficeAction.objects.exists()


def test_basico_cannot_get_a_price(admin_client):
    response = schedule(admin_client, code="basico")

    assert response.status_code == 400
    assert response.json() == {"detail": "El plan Básico es gratis: no se le programa un precio."}
    assert not PriceChange.objects.exists()


def test_an_unknown_plan_is_404(admin_client):
    assert schedule(admin_client, code="oro").status_code == 404


def test_only_one_pending_change_per_plan(admin_client):
    schedule(admin_client)

    response = schedule(admin_client, price=17900, effective_on="2027-01-10")

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Ese plan ya tiene un cambio de precio programado. Cancelalo antes de "
        "programar otro."
    }
    assert PriceChange.objects.count() == 1


def test_another_plan_can_have_its_own_change(admin_client):
    schedule(admin_client)

    assert schedule(admin_client, code="empresa", price=54900).status_code == 201


def test_cancelling_a_pending_change(admin_client, admin_user):
    _, _ = subscribed("ana@example.com")
    schedule(admin_client)
    mail.outbox.clear()

    response = admin_client.delete(f"{PRICES}productor/cambio/")

    assert response.status_code == 200
    assert response.json()["pending_change"] is None
    assert PriceChange.objects.get().cancelled_at == NOW
    action = BackofficeAction.objects.filter(action="price_unschedule").get()
    assert action.actor == admin_user
    assert action.payload == {
        "plan": "productor",
        "price_ars_month": 16900,
        "effective_on": IN_30_DAYS,
    }
    assert mail.outbox == []
    # A new one can be scheduled after cancelling.
    assert schedule(admin_client, price=15900).status_code == 201


def test_cancelling_without_a_pending_change_is_404(admin_client):
    response = admin_client.delete(f"{PRICES}productor/cambio/")

    assert response.status_code == 404
    assert response.json() == {"detail": "Ese plan no tiene un cambio de precio programado."}


@pytest.mark.parametrize("method", ["post", "delete"])
def test_only_super_admins_can_schedule(method):
    staff = account("staff@example.com", is_staff=True)

    response = getattr(client_for(staff), method)(
        f"{PRICES}productor/cambio/",
        {"price_ars_month": 16900, "effective_on": IN_30_DAYS},
        format="json",
    )

    assert response.status_code == 403
    assert not PriceChange.objects.exists()


# --- S2: the notice email --------------------------------------------------------------------


def test_every_affected_subscriber_gets_one_notice(
    admin_client, django_capture_on_commit_callbacks
):
    _, ana = subscribed("ana@example.com")
    _, beto = subscribed("beto@example.com", status="paused")
    subscribed("caro@example.com", status="cancelled")  # no more charges
    subscribed("dani@example.com", status="pending")  # not paying yet
    subscribed("eva@example.com", plan=Plan.EMPRESA, amount=49900)  # another plan
    subscribed("fede@example.com", amount=16900)  # already pays the new price
    _, ended = subscribed("gabi@example.com", status="paused")
    ended.ended_at = NOW
    ended.save()

    with django_capture_on_commit_callbacks(execute=True):
        response = schedule(admin_client)

    assert response.json()["pending_change"]["notices"] == 2
    assert response.json()["pending_change"]["notices_sent"] == 0  # sent after the response
    assert sorted(message.to[0] for message in mail.outbox) == [
        "ana@example.com",
        "beto@example.com",
    ]
    notices = PriceNotice.objects.order_by("subscription__user__email")
    assert [(n.subscription, n.old_amount, n.new_amount) for n in notices] == [
        (ana, 14900, 16900),
        (beto, 14900, 16900),
    ]
    assert all(n.sent_at == NOW for n in notices)
    assert admin_client.get(PRICES).json()[1]["pending_change"]["notices_sent"] == 2


def test_the_notice_says_what_changes_and_from_when(
    admin_client, django_capture_on_commit_callbacks
):
    subscribed("ana@example.com")

    with django_capture_on_commit_callbacks(execute=True):
        schedule(admin_client)

    [message] = mail.outbox
    assert message.subject == "Cambia el precio de tu plan Productor"
    assert "Hola Ana:" in message.body
    assert "pasa de $ 14.900 a $ 16.900 por mes" in message.body
    assert "a partir del 20 de diciembre de 2026" in message.body
    assert "/perfil/suscripcion" in message.body
    assert "/terminos" in message.body


def test_a_productor_change_reaches_founders_on_empresa(
    admin_client, django_capture_on_commit_callbacks
):
    # A founder pays Empresa minus Productor: 49.900 - 14.900 = 35.000.
    _, founder_sub = subscribed(
        "fundador@example.com", plan=Plan.EMPRESA, amount=35000, founder_number=7
    )
    subscribed("libre@example.com", plan=Plan.PRODUCTOR, amount=14900, founder_number=8)

    with django_capture_on_commit_callbacks(execute=True):
        schedule(admin_client)

    notice = PriceNotice.objects.get()
    assert (notice.subscription, notice.old_amount, notice.new_amount) == (
        founder_sub,
        35000,
        33000,
    )
    [message] = mail.outbox
    assert message.to == ["fundador@example.com"]
    assert "founder" in message.body


def test_a_lost_email_is_retried_by_the_daily_task_and_never_sent_twice(
    admin_client, django_capture_on_commit_callbacks, monkeypatch
):
    subscribed("ana@example.com")
    from apps.payments import price_changes

    def broken(*args, **kwargs):
        raise ConnectionError("smtp down")

    monkeypatch.setattr(price_changes, "send_mail", broken)
    with django_capture_on_commit_callbacks(execute=True):
        assert schedule(admin_client).status_code == 201

    assert PriceNotice.objects.get().sent_at is None
    monkeypatch.undo()

    tasks.price_notices()
    tasks.price_notices()

    assert len(mail.outbox) == 1
    assert PriceNotice.objects.get().sent_at == NOW


def test_a_cancelled_change_sends_no_pending_notice(admin_client, monkeypatch):
    subscribed("ana@example.com")
    schedule(admin_client)  # on_commit not run: the notice is still unsent
    admin_client.delete(f"{PRICES}productor/cambio/")

    tasks.price_notices()

    assert mail.outbox == []


def test_a_late_subscriber_gets_the_notice_from_the_daily_task(
    admin_client, django_capture_on_commit_callbacks
):
    with django_capture_on_commit_callbacks(execute=True):
        schedule(admin_client)
    _, late = subscribed("tarde@example.com")  # authorized after the change was scheduled

    tasks.price_notices()
    tasks.price_notices()

    notice = PriceNotice.objects.get()
    assert (notice.subscription, notice.new_amount) == (late, 16900)
    [message] = mail.outbox
    assert message.to == ["tarde@example.com"]
