"""Inbox and Web Push subscription APIs (odd/tasks/cuenta-planes-alertas.md S7)."""

from datetime import date, timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.alerts.models import AlertEvent, PushSubscription

from .conftest import PASSWORD
from .test_alert_rules import client_for, make_rule, on_plan
from .test_lotes import make_lote

pytestmark = pytest.mark.django_db

EVENTS = "/api/alertas/eventos/"
READ = "/api/alertas/eventos/leer/"
PUSH_KEY = "/api/alertas/push/clave/"
PUSH = "/api/alertas/push/"
ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc"


def make_event(user, lote=None, day=0, **fields):
    data = {
        "user": user,
        "lote": lote,
        "target_date": date(2026, 11, 4) + timedelta(days=day),
        "title": f"Alerta {day}",
        "body": "Texto",
        "data": {"value": 1.0},
    }
    data.update(fields)
    return AlertEvent.objects.create(**data)


def subscription(endpoint=ENDPOINT, p256dh="p256dh-key", auth="auth-key"):
    return {"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth}}


@pytest.fixture
def productor(user):
    return on_plan(user, "productor")


class TestEventList:
    def test_lists_own_events_newest_first_with_the_unread_count(self, user, make_user):
        lote = make_lote(user, name="Lote Norte")
        older = make_event(user, lote, day=0, rule=make_rule(user, lote))
        newer = make_event(user, None, day=1, read_at=timezone.now())
        make_event(make_user(email="beto@example.com"), day=2)

        response = client_for(user).get(EVENTS)

        assert response.status_code == 200
        body = response.json()
        assert body["unread_count"] == 1
        assert [e["id"] for e in body["results"]] == [newer.pk, older.pk]
        item = body["results"][1]
        assert set(item) == {
            "id",
            "title",
            "body",
            "target_date",
            "created_at",
            "read_at",
            "lote",
            "lote_name",
            "data",
        }
        assert (item["lote"], item["lote_name"]) == (lote.pk, "Lote Norte")
        assert item["target_date"] == "2026-11-04"
        assert item["read_at"] is None
        assert item["data"] == {"value": 1.0}
        assert (body["results"][0]["lote"], body["results"][0]["lote_name"]) == (None, None)

    def test_returns_the_last_100(self, user):
        AlertEvent.objects.bulk_create(
            AlertEvent(user=user, target_date=date(2026, 11, 4), title=f"A{i}", body="")
            for i in range(105)
        )

        body = client_for(user).get(EVENTS).json()

        assert len(body["results"]) == 100
        assert body["unread_count"] == 105

    def test_needs_a_session(self):
        assert APIClient().get(EVENTS).status_code == 403


class TestMarkRead:
    def test_marks_the_given_own_events(self, user, make_user):
        first, second = make_event(user, day=0), make_event(user, day=1)
        foreign = make_event(make_user(email="beto@example.com"))

        response = client_for(user).post(READ, {"ids": [first.pk, foreign.pk]}, format="json")

        assert response.status_code == 204
        first.refresh_from_db()
        second.refresh_from_db()
        foreign.refresh_from_db()
        assert first.read_at is not None
        assert second.read_at is None
        assert foreign.read_at is None

    def test_without_ids_marks_every_unread_event(self, user, make_user):
        earlier = timezone.now() - timedelta(days=3)
        already = make_event(user, day=0, read_at=earlier)
        unread = make_event(user, day=1)
        foreign = make_event(make_user(email="beto@example.com"))

        response = client_for(user).post(READ, {}, format="json")

        assert response.status_code == 204
        already.refresh_from_db()
        unread.refresh_from_db()
        foreign.refresh_from_db()
        assert already.read_at == earlier
        assert unread.read_at is not None
        assert foreign.read_at is None
        assert client_for(user).get(EVENTS).json()["unread_count"] == 0

    def test_rejects_ids_that_are_not_numbers(self, user):
        response = client_for(user).post(READ, {"ids": ["x"]}, format="json")

        assert response.status_code == 400


class TestPushKey:
    def test_returns_the_public_key(self, user, settings):
        settings.VAPID_PUBLIC_KEY = "BPublicKey"
        settings.VAPID_PRIVATE_KEY = "private"

        response = client_for(user).get(PUSH_KEY)

        assert response.status_code == 200
        assert response.json() == {"public_key": "BPublicKey"}

    def test_not_configured_is_503(self, user, settings):
        settings.VAPID_PUBLIC_KEY = ""

        response = client_for(user).get(PUSH_KEY)

        assert response.status_code == 503
        assert response.json() == {
            "detail": "Las notificaciones push todavía no están configuradas."
        }


class TestSubscribe:
    def test_creates_the_subscription_with_the_browser(self, productor):
        response = client_for(productor).post(
            PUSH, subscription(), format="json", HTTP_USER_AGENT="Mozilla/5.0 " + "x" * 400
        )

        assert response.status_code == 201
        sub = PushSubscription.objects.get()
        assert (sub.user, sub.endpoint, sub.p256dh, sub.auth) == (
            productor,
            ENDPOINT,
            "p256dh-key",
            "auth-key",
        )
        assert len(sub.user_agent) == 300
        assert sub.user_agent.startswith("Mozilla/5.0 ")

    def test_the_same_endpoint_updates_the_keys(self, productor):
        client = client_for(productor)
        client.post(PUSH, subscription(), format="json")

        response = client.post(PUSH, subscription(p256dh="new", auth="new-auth"), format="json")

        assert response.status_code == 200
        sub = PushSubscription.objects.get()
        assert (sub.p256dh, sub.auth) == ("new", "new-auth")

    def test_a_shared_phone_moves_the_subscription_to_the_current_user(self, productor, make_user):
        other = on_plan(make_user(email="beto@example.com"), "productor")
        client_for(other).post(PUSH, subscription(), format="json")

        response = client_for(productor).post(PUSH, subscription(), format="json")

        assert response.status_code == 200
        assert PushSubscription.objects.get().user == productor

    def test_a_plan_without_push_is_402(self, user):
        assert user.plan_id == "basico"

        response = client_for(user).post(PUSH, subscription(), format="json")

        assert response.status_code == 402
        assert response.json() == {
            "detail": "Tu plan Básico no incluye notificaciones push. "
            "Mirá los planes para sumar más.",
            "code": "plan_limit",
        }
        assert not PushSubscription.objects.exists()

    @pytest.mark.parametrize(
        "payload",
        [
            {"endpoint": ENDPOINT},
            {"endpoint": "no-es-una-url", "keys": {"p256dh": "a", "auth": "b"}},
            {"endpoint": "http://fcm.googleapis.com/x", "keys": {"p256dh": "a", "auth": "b"}},
            {"endpoint": ENDPOINT, "keys": {"p256dh": "", "auth": "b"}},
        ],
    )
    def test_rejects_an_invalid_subscription(self, productor, payload):
        response = client_for(productor).post(PUSH, payload, format="json")

        assert response.status_code == 400
        assert not PushSubscription.objects.exists()


class TestUnsubscribe:
    def test_deletes_only_the_callers_row(self, productor, make_user):
        PushSubscription.objects.create(user=productor, endpoint=ENDPOINT, p256dh="a", auth="b")
        other = make_user(email="beto@example.com")
        foreign = PushSubscription.objects.create(
            user=other, endpoint="https://fcm.googleapis.com/fcm/send/other", p256dh="a", auth="b"
        )
        client = client_for(productor)

        mine = client.delete(PUSH, {"endpoint": ENDPOINT}, format="json")
        theirs = client.delete(PUSH, {"endpoint": foreign.endpoint}, format="json")

        assert (mine.status_code, theirs.status_code) == (204, 204)
        assert list(PushSubscription.objects.all()) == [foreign]

    def test_an_unknown_endpoint_is_204(self, productor):
        response = client_for(productor).delete(PUSH, {"endpoint": ENDPOINT}, format="json")

        assert response.status_code == 204


class TestCsrf:
    @pytest.fixture
    def logged_in(self, csrf_client, productor):
        token = csrf_client.get("/api/auth/csrf/").cookies["csrftoken"].value
        response = csrf_client.post(
            "/api/auth/login/",
            {"email": productor.email, "password": PASSWORD},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        assert response.status_code == 200
        return csrf_client, csrf_client.cookies["csrftoken"].value

    @pytest.mark.parametrize(
        ("method", "url", "payload"),
        [
            ("post", PUSH, subscription()),
            ("delete", PUSH, {"endpoint": ENDPOINT}),
            ("post", READ, {}),
        ],
    )
    def test_unsafe_requests_need_the_token(self, logged_in, method, url, payload):
        client, token = logged_in

        refused = getattr(client, method)(url, payload, format="json")
        accepted = getattr(client, method)(url, payload, format="json", HTTP_X_CSRFTOKEN=token)

        assert refused.status_code == 403
        assert accepted.status_code in (200, 201, 204)
