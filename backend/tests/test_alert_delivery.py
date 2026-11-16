"""Alert delivery by push and email (odd/tasks/cuenta-planes-alertas.md S7)."""

import json
import smtplib
from datetime import date

import pytest
import requests
from django.core import mail
from pywebpush import WebPushException

from apps.alerts import delivery
from apps.alerts.models import AlertEvent, PushSubscription
from apps.alerts.tasks import deliver_event

from .test_alert_rules import make_rule, on_plan
from .test_lotes import make_lote

pytestmark = pytest.mark.django_db

ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc"


@pytest.fixture(autouse=True)
def _vapid(settings):
    settings.VAPID_PUBLIC_KEY = "public-key"
    settings.VAPID_PRIVATE_KEY = "private-key"
    settings.VAPID_SUBJECT = "mailto:soporte@example.com"


class FakeWebPush:
    """Stands in for pywebpush.webpush: records calls, fails on demand per endpoint."""

    def __init__(self):
        self.calls = []
        self.failures = {}  # endpoint -> exception, raised on every call

    def __call__(self, subscription_info, **kwargs):
        self.calls.append({"subscription_info": subscription_info, **kwargs})
        failure = self.failures.get(subscription_info["endpoint"])
        if failure is not None:
            raise failure
        return "ok"


@pytest.fixture
def webpush(monkeypatch):
    fake = FakeWebPush()
    monkeypatch.setattr(delivery, "webpush", fake)
    return fake


def push_error(status):
    if status is None:  # what pywebpush raises for malformed subscription keys
        return WebPushException("Push failed: bad subscription keys")
    response = requests.Response()
    response.status_code = status
    return WebPushException(f"Push failed: {status}", response=response)


def make_event(user, **fields):
    lote = make_lote(user, name="Lote Norte")
    data = {
        "user": user,
        "rule": make_rule(user, lote),
        "lote": lote,
        "target_date": date(2026, 11, 4),
        "title": "Mínima de 1 °C mañana en Lote Norte",
        "body": "Mínima menor a 2 °C en Lote Norte: mañana 1 °C a las 05:00.",
    }
    data.update(fields)
    return AlertEvent.objects.create(**data)


def subscribe(user, endpoint=ENDPOINT):
    return PushSubscription.objects.create(
        user=user, endpoint=endpoint, p256dh="p256dh-key", auth="auth-key"
    )


@pytest.fixture
def productor(user):
    return on_plan(user, "productor")


def statuses(event):
    event.refresh_from_db()
    return event.push_status, event.email_status


class TestPush:
    def test_sends_to_every_subscription_of_the_user(self, productor, webpush):
        subscribe(productor)
        subscribe(productor, "https://updates.push.services.mozilla.com/wpush/v2/xyz")
        event = make_event(productor)

        delivery.deliver(event.pk)

        assert statuses(event) == ("sent", "sent")
        assert [c["subscription_info"]["endpoint"] for c in webpush.calls] == [
            ENDPOINT,
            "https://updates.push.services.mozilla.com/wpush/v2/xyz",
        ]
        call = webpush.calls[0]
        assert call["subscription_info"] == {
            "endpoint": ENDPOINT,
            "keys": {"p256dh": "p256dh-key", "auth": "auth-key"},
        }
        assert json.loads(call["data"]) == {
            "title": "Mínima de 1 °C mañana en Lote Norte",
            "body": "Mínima menor a 2 °C en Lote Norte: mañana 1 °C a las 05:00.",
            "url": "/alertas",
            "tag": f"alert-{event.pk}",
        }
        assert call["vapid_private_key"] == "private-key"
        assert call["vapid_claims"] == {"sub": "mailto:soporte@example.com"}
        assert call["ttl"] == 43200

    def test_skipped_on_a_plan_without_push(self, user, webpush):
        assert user.plan_id == "basico"
        subscribe(user)
        event = make_event(user)

        delivery.deliver(event.pk)

        assert statuses(event) == ("skipped", "sent")
        assert webpush.calls == []

    def test_skipped_when_the_user_turned_push_off(self, productor, webpush):
        productor.notify_push = False
        productor.save()
        subscribe(productor)
        event = make_event(productor)

        delivery.deliver(event.pk)

        assert statuses(event)[0] == "skipped"
        assert webpush.calls == []

    def test_skipped_without_subscriptions(self, productor, webpush):
        event = make_event(productor)

        delivery.deliver(event.pk)

        assert statuses(event)[0] == "skipped"
        assert webpush.calls == []

    def test_another_users_subscription_is_not_used(self, productor, make_user, webpush):
        subscribe(on_plan(make_user(email="beto@example.com"), "productor"))
        event = make_event(productor)

        delivery.deliver(event.pk)

        assert statuses(event)[0] == "skipped"
        assert webpush.calls == []

    def test_skipped_with_a_warning_when_vapid_keys_are_missing(
        self, productor, webpush, settings, caplog
    ):
        settings.VAPID_PRIVATE_KEY = ""
        subscribe(productor)
        event = make_event(productor)

        delivery.deliver(event.pk)

        assert statuses(event)[0] == "skipped"
        assert webpush.calls == []
        assert "VAPID" in caplog.text

    @pytest.mark.parametrize("status", [404, 410])
    def test_a_gone_subscription_is_deleted_and_is_not_an_error(self, productor, webpush, status):
        gone = subscribe(productor, "https://fcm.googleapis.com/fcm/send/gone")
        subscribe(productor)
        webpush.failures[gone.endpoint] = push_error(status)
        event = make_event(productor)

        delivery.deliver(event.pk)

        assert statuses(event)[0] == "sent"
        assert list(PushSubscription.objects.values_list("endpoint", flat=True)) == [ENDPOINT]
        event.refresh_from_db()
        assert event.attempts == 0

    def test_only_gone_subscriptions_ends_skipped(self, productor, webpush):
        webpush.failures[subscribe(productor).endpoint] = push_error(410)
        event = make_event(productor)

        delivery.deliver(event.pk)

        assert statuses(event)[0] == "skipped"
        assert not PushSubscription.objects.exists()


class TestEmail:
    def test_sends_the_event_with_a_link_to_the_inbox(self, user, webpush):
        event = make_event(user)

        delivery.deliver(event.pk)

        assert statuses(event)[1] == "sent"
        [message] = mail.outbox
        assert message.to == [user.email]
        assert message.subject == "Mínima de 1 °C mañana en Lote Norte"
        assert "Mínima menor a 2 °C en Lote Norte: mañana 1 °C a las 05:00." in message.body
        assert "https://clima.example.com/alertas" in message.body

    def test_skipped_when_the_user_turned_email_off(self, user, webpush):
        user.notify_email = False
        user.save()
        event = make_event(user)

        delivery.deliver(event.pk)

        assert statuses(event)[1] == "skipped"
        assert mail.outbox == []


def failing_smtp(monkeypatch):
    def refuse(*args, **kwargs):
        raise smtplib.SMTPServerDisconnected("Connection unexpectedly closed")

    monkeypatch.setattr(delivery, "send_mail", refuse)


class TestPermanentFailures:
    @pytest.mark.parametrize("status", [None, 400, 413])
    def test_a_broken_subscription_is_dropped_without_retrying_the_others(
        self, productor, webpush, status
    ):
        good = subscribe(productor)
        broken = subscribe(productor, endpoint="https://push.example.com/rota")
        webpush.failures[broken.endpoint] = push_error(status)
        event = make_event(productor)

        delivery.deliver(event.pk)

        assert statuses(event)[0] == "sent"
        assert list(PushSubscription.objects.values_list("endpoint", flat=True)) == [good.endpoint]

    @pytest.mark.parametrize("status", [401, 403])
    def test_rejected_credentials_fail_the_push_without_retrying(
        self, productor, webpush, status, caplog
    ):
        webpush.failures[subscribe(productor).endpoint] = push_error(status)
        event = make_event(productor)

        delivery.deliver(event.pk)

        assert statuses(event)[0] == "failed"
        assert PushSubscription.objects.count() == 1  # our keys, not the browser, are at fault
        assert "rejected our VAPID credentials" in caplog.text


class TestTransientFailures:
    def test_a_push_failure_puts_the_channel_back_to_pending(self, productor, webpush):
        webpush.failures[subscribe(productor).endpoint] = push_error(500)
        event = make_event(productor)

        with pytest.raises(delivery.RetryLater):
            delivery.deliver(event.pk)

        event.refresh_from_db()
        assert (event.push_status, event.email_status, event.attempts) == ("pending", "sent", 1)
        assert PushSubscription.objects.count() == 1

    def test_a_network_error_is_transient(self, productor, webpush):
        webpush.failures[subscribe(productor).endpoint] = requests.ConnectionError("timeout")
        event = make_event(productor)

        with pytest.raises(delivery.RetryLater):
            delivery.deliver(event.pk)

        assert statuses(event)[0] == "pending"

    def test_an_smtp_failure_puts_the_email_back_to_pending(self, user, webpush, monkeypatch):
        failing_smtp(monkeypatch)
        event = make_event(user)

        with pytest.raises(delivery.RetryLater):
            delivery.deliver(event.pk)

        event.refresh_from_db()
        assert (event.push_status, event.email_status, event.attempts) == ("skipped", "pending", 1)

    def test_the_retry_only_sends_the_pending_channel(self, productor, webpush, monkeypatch):
        subscribe(productor)
        failing_smtp(monkeypatch)
        event = make_event(productor)
        with pytest.raises(delivery.RetryLater):
            delivery.deliver(event.pk)
        monkeypatch.undo()
        monkeypatch.setattr(delivery, "webpush", webpush)

        delivery.deliver(event.pk)

        assert statuses(event) == ("sent", "sent")
        assert len(webpush.calls) == 1
        assert len(mail.outbox) == 1

    def test_the_final_attempt_marks_the_channel_failed(self, productor, webpush, monkeypatch):
        webpush.failures[subscribe(productor).endpoint] = push_error(503)
        failing_smtp(monkeypatch)
        event = make_event(productor)

        delivery.deliver(event.pk, final=True)

        event.refresh_from_db()
        assert (event.push_status, event.email_status, event.attempts) == ("failed", "failed", 1)

    def test_the_task_retries_three_times_then_fails(self, productor, webpush):
        webpush.failures[subscribe(productor).endpoint] = push_error(500)
        event = make_event(productor)

        deliver_event.delay(event.pk)

        event.refresh_from_db()
        assert (event.push_status, event.email_status, event.attempts) == ("failed", "sent", 4)
        assert len(webpush.calls) == 4  # first try + 3 retries
        assert len(mail.outbox) == 1

    def test_the_task_recovers_when_a_retry_succeeds(self, productor, webpush, monkeypatch):
        webpush.failures[subscribe(productor).endpoint] = push_error(500)
        event = make_event(productor)

        def fail_once(subscription_info, **kwargs):
            try:
                return webpush(subscription_info, **kwargs)
            finally:
                webpush.failures.clear()  # the next try works

        monkeypatch.setattr(delivery, "webpush", fail_once)
        deliver_event.delay(event.pk)

        event.refresh_from_db()
        assert (event.push_status, event.attempts) == ("sent", 1)
        assert len(webpush.calls) == 2

    def test_an_unexpected_error_fails_the_channel_without_retry(self, productor, webpush):
        webpush.failures[subscribe(productor).endpoint] = ValueError("Could not deserialize key")
        event = make_event(productor)

        delivery.deliver(event.pk)

        event.refresh_from_db()
        assert (event.push_status, event.email_status, event.attempts) == ("failed", "sent", 0)


class TestIdempotency:
    def test_a_second_delivery_sends_nothing(self, productor, webpush):
        subscribe(productor)
        event = make_event(productor)
        deliver_event.delay(event.pk)

        deliver_event.delay(event.pk)

        assert statuses(event) == ("sent", "sent")
        assert len(webpush.calls) == 1
        assert len(mail.outbox) == 1

    @pytest.mark.parametrize("status", ["sending", "sent", "skipped", "failed"])
    def test_a_channel_that_is_not_pending_is_never_sent(self, productor, webpush, status):
        subscribe(productor)
        event = make_event(productor, push_status=status, email_status=status)

        delivery.deliver(event.pk)

        assert statuses(event) == (status, status)
        assert webpush.calls == []
        assert mail.outbox == []

    def test_a_deleted_event_is_ignored(self, user, webpush):
        event = make_event(user)
        event.delete()

        assert deliver_event.delay(event.pk).successful()
        assert mail.outbox == []
