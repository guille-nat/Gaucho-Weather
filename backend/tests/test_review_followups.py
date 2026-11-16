"""Follow-ups of the split review of ba985f9..3f68bb3 (odd/tasks/cuenta-planes-alertas.md T19)."""

import smtplib
from datetime import timedelta

import httpx
import pytest
import respx
from django.core import mail
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts import password_reset, plans
from apps.accounts.models import PlanChange, PlanRequest, User
from apps.alerts import tasks as alert_tasks
from apps.alerts.models import AlertEvent
from apps.archiver import openmeteo
from apps.archiver import tasks as archiver_tasks
from apps.archiver.cells import grid_cell

from .test_alert_rules import make_rule
from .test_lotes import make_lote

pytestmark = pytest.mark.django_db

SECRET = "clave-comercial-secreta"


def client_for(user):
    client = APIClient()
    client.force_login(user)
    return client


class TestNoKeyInLogs:
    @respx.mock
    def test_a_failed_history_fetch_logs_the_status_not_the_url(self, user, settings, caplog):
        settings.OPEN_METEO_API_KEY = SECRET
        make_lote(user)
        respx.route().mock(return_value=httpx.Response(500))

        archiver_tasks.fetch_history()

        assert "HTTP 500" in caplog.text
        assert SECRET not in caplog.text

    @respx.mock
    def test_a_failed_forecast_fetch_logs_the_status_not_the_url(self, settings, caplog):
        settings.OPEN_METEO_API_KEY = SECRET
        respx.route().mock(return_value=httpx.Response(429))

        with httpx.Client() as client:
            archiver_tasks.archive_cell(client, grid_cell(-33.04, -61.06), openmeteo.JOBS)

        assert "HTTP 429" in caplog.text
        assert SECRET not in caplog.text


class TestPushHosts:
    def subscribe(self, user, endpoint):
        User.objects.filter(pk=user.pk).update(plan_id="productor")
        return client_for(user).post(
            "/api/alertas/push/",
            {"endpoint": endpoint, "keys": {"p256dh": "k" * 20, "auth": "a" * 10}},
            format="json",
        )

    @pytest.mark.parametrize(
        "endpoint",
        [
            "https://fcm.googleapis.com/fcm/send/abc",
            "https://updates.push.services.mozilla.com/wpush/v2/abc",
            "https://web.push.apple.com/QGx",
            "https://wns2-par02p.notify.windows.com/w/?token=x",
        ],
    )
    def test_browser_push_services_are_accepted(self, user, endpoint):
        assert self.subscribe(user, endpoint).status_code == 201

    @pytest.mark.parametrize(
        "endpoint",
        [
            "https://169.254.169.254/latest/meta-data",
            "https://localhost/x",
            "https://10.0.0.5/x",
            "https://fcm.googleapis.com.attacker.example/x",
            "https://evil.example/fcm.googleapis.com",
        ],
    )
    def test_any_other_host_is_refused(self, user, endpoint):
        response = self.subscribe(user, endpoint)

        assert response.status_code == 400
        assert response.json() == {
            "endpoint": ["Ese servicio de notificaciones no está permitido."]
        }


class TestRedispatch:
    def make_event(self, user, minutes_ago, **fields):
        lote = make_lote(user)
        event = AlertEvent.objects.create(
            user=user, lote=lote, target_date=timezone.localdate(), title="T", body="B", **fields
        )
        AlertEvent.objects.filter(pk=event.pk).update(
            created_at=timezone.now() - timedelta(minutes=minutes_ago)
        )
        return event

    def test_an_event_left_pending_by_a_queue_outage_is_sent_on_the_next_run(
        self, user, monkeypatch, django_capture_on_commit_callbacks
    ):
        stuck = self.make_event(user, minutes_ago=60)
        recent = self.make_event(user, minutes_ago=2)  # may still be in flight
        old = self.make_event(user, minutes_ago=3 * 24 * 60)  # too late to be useful
        done = self.make_event(user, minutes_ago=60, push_status="skipped", email_status="sent")
        queued = []
        monkeypatch.setattr(alert_tasks.deliver_event, "delay", queued.append)

        with django_capture_on_commit_callbacks(execute=True):
            stats = alert_tasks.run_evaluation()

        assert queued == [stuck.pk]
        assert stats["redispatched"] == 1
        assert {recent.pk, old.pk, done.pk}.isdisjoint(queued)


class TestEvaluationIsolation:
    def test_one_broken_cell_does_not_stop_the_others(self, user, monkeypatch, caplog):
        broken = make_rule(user, make_lote(user, latitude="-33.04", longitude="-61.06"))
        fine = make_rule(user, make_lote(user, latitude="-31.40", longitude="-64.18"))
        cells = {grid_cell(r.lote.latitude, r.lote.longitude): r for r in (broken, fine)}

        class Forecast:
            def __init__(self, payload):
                self.payload = payload

        now = timezone.now()
        monkeypatch.setattr(
            alert_tasks,
            "forecasts",
            lambda by_cell, at: {cell: Forecast({"fetched_at": now.isoformat()}) for cell in cells},
        )

        def evaluate(rule, payload, at):
            if rule.pk == broken.pk:
                raise KeyError("hourly")
            return []

        monkeypatch.setattr(alert_tasks, "evaluate", evaluate)

        stats = alert_tasks.run_evaluation(now)

        assert stats["errors"] == 1
        assert "Alert evaluation failed for cell" in caplog.text


class TestResetCooldown:
    def test_an_smtp_failure_does_not_block_the_next_try(self, user, monkeypatch):
        def refuse(*args, **kwargs):
            raise smtplib.SMTPServerDisconnected("down")

        monkeypatch.setattr(password_reset, "send_mail", refuse)
        with pytest.raises(OSError):
            password_reset.send_reset_email(user.email)
        monkeypatch.undo()

        assert password_reset.send_reset_email(user.email) is True
        assert len(mail.outbox) == 1
        cache.clear()


class TestOnlyAMoveRefetches:
    @pytest.fixture
    def queued(self, settings, monkeypatch):
        settings.LOTE_FORECAST_ON_CREATE = True
        settings.HISTORY_BACKFILL_ON_CREATE = True
        calls = []
        monkeypatch.setattr(
            archiver_tasks.fetch_cell_forecast, "delay", lambda *a: calls.append("forecast")
        )
        monkeypatch.setattr(
            archiver_tasks.backfill_history, "delay", lambda *a: calls.append("history")
        )
        return calls

    def test_renaming_a_lote_queues_nothing(self, user, queued, django_capture_on_commit_callbacks):
        lote = make_lote(user)
        with django_capture_on_commit_callbacks(execute=True):
            client_for(user).patch(f"/api/lotes/{lote.pk}/", {"name": "Otro"}, format="json")

        assert queued == []

    def test_moving_a_lote_queues_its_weather(
        self, user, queued, django_capture_on_commit_callbacks
    ):
        lote = make_lote(user)
        with django_capture_on_commit_callbacks(execute=True):
            client_for(user).patch(
                f"/api/lotes/{lote.pk}/", {"latitude": -31.4, "longitude": -64.18}, format="json"
            )

        assert sorted(queued) == ["forecast", "history"]


class TestKeepProductorAfterTrial:
    def test_a_trial_account_can_ask_to_keep_productor(self, user):
        User.objects.filter(pk=user.pk).update(
            plan_id="productor", plan_expires_at=timezone.now() + timedelta(days=5)
        )

        response = client_for(user).post(
            "/api/auth/suscripcion/pedido/", {"kind": "change", "plan": "productor"}, format="json"
        )

        assert response.status_code == 201
        request = PlanRequest.objects.get()
        assert plans.apply_request(request.pk, by=user)
        user.refresh_from_db()
        assert (user.plan_id, user.plan_expires_at) == ("productor", None)
        change = PlanChange.objects.filter(user=user, reason="request").get()
        assert (change.from_plan_id, change.to_plan_id) == ("productor", "productor")

    def test_an_active_productor_still_cannot_ask_for_productor(self, user):
        User.objects.filter(pk=user.pk).update(plan_id="productor", plan_expires_at=None)

        response = client_for(user).post(
            "/api/auth/suscripcion/pedido/", {"kind": "change", "plan": "productor"}, format="json"
        )

        assert response.status_code == 400
        assert response.json() == {"detail": "Ya estás en el plan Productor."}


class TestPlanRequestAdminPermissions:
    def test_staff_who_can_only_view_requests_cannot_apply_them(self, user, make_user):
        from django.contrib.auth.models import Permission

        viewer = make_user(email="visor@example.com")
        viewer.is_staff = True
        viewer.save()
        viewer.user_permissions.add(Permission.objects.get(codename="view_planrequest"))
        request = plans.request_plan(user, "change", "empresa")
        client = APIClient()
        client.force_login(viewer)

        client.post(
            "/api/admin/accounts/planrequest/",
            {"action": "apply_requests", "_selected_action": [request.pk]},
        )

        request.refresh_from_db()
        user.refresh_from_db()
        assert request.status == "pending"
        assert user.plan_id == "basico"


class TestPushHostsAtDelivery:
    def test_a_stored_subscription_outside_the_allowlist_is_never_called_and_is_dropped(
        self, user, settings, monkeypatch, caplog
    ):
        from apps.alerts import delivery
        from apps.alerts.models import PushSubscription

        settings.VAPID_PUBLIC_KEY, settings.VAPID_PRIVATE_KEY = "pub", "priv"
        User.objects.filter(pk=user.pk).update(plan_id="productor")
        user.refresh_from_db()
        good = PushSubscription.objects.create(
            user=user, endpoint="https://fcm.googleapis.com/fcm/send/ok", p256dh="k", auth="a"
        )
        # Saved before the allowlist existed: the worker must never POST to it.
        PushSubscription.objects.create(
            user=user, endpoint="https://169.254.169.254/latest", p256dh="k", auth="a"
        )
        called = []
        monkeypatch.setattr(
            delivery, "webpush", lambda info, **kw: called.append(info["endpoint"]) or "ok"
        )
        event = AlertEvent.objects.create(
            user=user, lote=make_lote(user), target_date=timezone.localdate(), title="T", body="B"
        )

        delivery.deliver(event.pk)

        assert called == [good.endpoint]
        assert list(PushSubscription.objects.values_list("endpoint", flat=True)) == [good.endpoint]
        assert "not an allowed push service" in caplog.text
