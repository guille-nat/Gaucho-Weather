"""The alerts.evaluate_rules task, its command, and the archiver hook (S6, S4 cap)."""

from datetime import timedelta
from decimal import Decimal
from io import StringIO

import httpx
import pytest
import respx
import time_machine
from django.conf import settings
from django.core import mail
from django.core.management import call_command
from kombu.exceptions import OperationalError

from apps.alerts import tasks as alert_tasks
from apps.alerts.models import AlertEvent
from apps.alerts.tasks import evaluate_rules
from apps.archiver.models import ForecastSnapshot
from apps.archiver.tasks import fetch_forecasts

from .test_alert_rules import make_rule
from .test_lotes import make_lote
from .test_pronostico import FETCHED, NOW, deterministic, store

pytestmark = pytest.mark.django_db

DET = ForecastSnapshot.Kind.DETERMINISTIC
OTHER_CELL_LOTE = {"latitude": Decimal("-34.5"), "longitude": Decimal("-60.0")}


@pytest.fixture(autouse=True)
def _now():
    with time_machine.travel(NOW, tick=False):
        yield


def archive(fetched_at=FETCHED):
    """Three models at 10 °C; tomorrow 05:00 drops to 1 °C (see test_pronostico.deterministic)."""
    for model in ("ecmwf_ifs025", "gfs_seamless", "icon_seamless"):
        store(model, DET, deterministic(10.0), fetched_at)


class TestEvaluateRules:
    def test_creates_one_event_for_a_rule_that_holds(self, user):
        lote = make_lote(user, name="Lote Norte")
        rule = make_rule(user, lote, variable="temp_min", comparator="lt", threshold=2)
        archive()

        stats = evaluate_rules()

        assert stats == {"rules": 1, "cells": 1, "created": 1, "skipped_stale": 0}
        event = AlertEvent.objects.get()
        assert (event.rule, event.user, event.lote) == (rule, user, lote)
        assert event.target_date.isoformat() == "2026-11-04"
        assert event.title == "Mínima de 1 °C mañana en Lote Norte"
        assert "Mínima menor a 2 °C en Lote Norte" in event.body
        assert event.data == {
            "value": 1.0,
            "threshold": 2.0,
            "comparator": "lt",
            "variable": "temp_min",
            "at": "2026-11-04T05:00:00-03:00",
        }
        assert (event.push_status, event.email_status) == ("pending", "pending")

    def test_second_run_creates_nothing(self, user):
        make_rule(user, make_lote(user))
        archive()
        evaluate_rules()

        stats = evaluate_rules()

        assert stats["created"] == 0
        assert AlertEvent.objects.count() == 1

    def test_a_rule_that_does_not_hold_creates_nothing(self, user):
        make_rule(user, make_lote(user), threshold=-5)
        archive()

        assert evaluate_rules()["created"] == 0
        assert not AlertEvent.objects.exists()

    def test_skips_a_stale_forecast(self, user):
        assert settings.ALERTS_MAX_FORECAST_AGE_HOURS == 12
        make_rule(user, make_lote(user))
        archive(fetched_at=NOW - timedelta(hours=12, minutes=1))

        stats = evaluate_rules()

        assert stats == {"rules": 1, "cells": 1, "created": 0, "skipped_stale": 1}
        assert not AlertEvent.objects.exists()

    def test_the_maximum_age_comes_from_settings(self, user, settings):
        settings.ALERTS_MAX_FORECAST_AGE_HOURS = 2
        make_rule(user, make_lote(user))
        archive()  # 3 h 20 min old

        assert evaluate_rules()["skipped_stale"] == 1

    def test_skips_a_cell_without_forecast_and_evaluates_the_rest(self, user):
        make_rule(user, make_lote(user))
        make_rule(user, make_lote(user, name="Lejos", **OTHER_CELL_LOTE))
        archive()

        stats = evaluate_rules()

        assert stats == {"rules": 2, "cells": 2, "created": 1, "skipped_stale": 1}
        assert AlertEvent.objects.get().lote.name == "Lote"

    def test_disabled_rules_are_ignored(self, user):
        make_rule(user, make_lote(user), enabled=False)
        archive()

        assert evaluate_rules() == {"rules": 0, "cells": 0, "created": 0, "skipped_stale": 0}
        assert not AlertEvent.objects.exists()

    def test_rules_beyond_the_basico_cap_are_paused(self, user):
        assert user.plan_id == "basico"
        lote = make_lote(user)
        rules = [make_rule(user, lote) for _ in range(4)]
        archive()

        stats = evaluate_rules()

        assert stats["rules"] == 3
        assert {e.rule for e in AlertEvent.objects.all()} == set(rules[:3])

    def test_nothing_to_evaluate(self):
        assert evaluate_rules() == {"rules": 0, "cells": 0, "created": 0, "skipped_stale": 0}

    def test_command_runs_the_evaluation_and_prints_the_stats(self, user):
        make_rule(user, make_lote(user))
        archive()
        out = StringIO()

        call_command("evaluate_alerts", stdout=out)

        assert AlertEvent.objects.count() == 1
        assert "'created': 1" in out.getvalue()


def realistic(request):
    return httpx.Response(200, json=deterministic(10.0))


class TestArchiverHook:
    def test_fetching_forecasts_evaluates_the_rules(self, user):
        make_rule(user, make_lote(user))
        with respx.mock(assert_all_called=False) as mock:
            mock.get(settings.OPEN_METEO_FORECAST_URL).mock(side_effect=realistic)
            mock.get(settings.OPEN_METEO_ENSEMBLE_URL).mock(side_effect=realistic)

            stats = fetch_forecasts()

        assert stats["stored"] > 0
        assert AlertEvent.objects.get().target_date.isoformat() == "2026-11-04"

    def test_a_broker_outage_does_not_fail_the_archive_run(self, user, monkeypatch, caplog):
        def broker_down(*args, **kwargs):
            raise OperationalError("Error 111 connecting to redis:6379")

        monkeypatch.setattr(alert_tasks.evaluate_rules, "delay", broker_down)
        with respx.mock(assert_all_called=False) as mock:
            mock.get(settings.OPEN_METEO_FORECAST_URL).mock(side_effect=realistic)
            mock.get(settings.OPEN_METEO_ENSEMBLE_URL).mock(side_effect=realistic)

            stats = fetch_forecasts()

        assert stats["failed"] == 0
        assert "alert evaluation" in caplog.text


class TestDispatch:
    """Each new event is queued for delivery once, after the evaluation commits (S7)."""

    def test_queues_delivery_once_per_new_event(
        self, user, monkeypatch, django_capture_on_commit_callbacks
    ):
        queued = []
        monkeypatch.setattr(alert_tasks.deliver_event, "delay", queued.append)
        lote = make_lote(user)
        make_rule(user, lote)
        make_rule(user, lote, threshold=3)
        archive()

        with django_capture_on_commit_callbacks(execute=True):
            evaluate_rules()
        with django_capture_on_commit_callbacks(execute=True):
            evaluate_rules()  # nothing new

        assert sorted(queued) == sorted(AlertEvent.objects.values_list("pk", flat=True))
        assert len(queued) == 2

    def test_nothing_is_queued_before_the_commit(self, user, monkeypatch):
        queued = []
        monkeypatch.setattr(alert_tasks.deliver_event, "delay", queued.append)
        make_rule(user, make_lote(user))
        archive()

        evaluate_rules()  # the test transaction never commits

        assert AlertEvent.objects.count() == 1
        assert queued == []

    def test_the_evaluation_delivers_by_email(self, user, django_capture_on_commit_callbacks):
        make_rule(user, make_lote(user, name="Lote Norte"))
        archive()

        with django_capture_on_commit_callbacks(execute=True):
            evaluate_rules()

        event = AlertEvent.objects.get()
        assert (event.push_status, event.email_status) == ("skipped", "sent")
        assert [m.subject for m in mail.outbox] == [event.title]

    def test_a_broker_outage_is_logged_not_raised(
        self, user, monkeypatch, caplog, django_capture_on_commit_callbacks
    ):
        def broker_down(*args, **kwargs):
            raise OperationalError("Error 111 connecting to redis:6379")

        monkeypatch.setattr(alert_tasks.deliver_event, "delay", broker_down)
        make_rule(user, make_lote(user))
        archive()

        with django_capture_on_commit_callbacks(execute=True):
            stats = evaluate_rules()

        assert stats["created"] == 1
        assert "Could not queue the delivery" in caplog.text
