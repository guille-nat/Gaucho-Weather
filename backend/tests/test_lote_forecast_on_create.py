"""S12: creating or moving a lote fetches its cell's forecast at once."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import httpx
import pytest
import respx
import time_machine
from django.conf import settings as django_settings
from kombu.exceptions import OperationalError
from rest_framework.test import APIClient

from apps.archiver import openmeteo, tasks
from apps.archiver.models import ForecastSnapshot

from .test_lotes import make_lote

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 11, 16, 12, 7, tzinfo=UTC)
LOTES = "/api/lotes/"
CELL = (Decimal("-33.0"), Decimal("-61.1"))


def payload(request):
    return httpx.Response(
        200,
        json={
            "latitude": float(request.url.params["latitude"]),
            "hourly": {"time": ["2026-11-16T00:00"], "temperature_2m": [12.3]},
        },
    )


@pytest.fixture
def open_meteo():
    with respx.mock(assert_all_called=False) as mock:
        forecast = mock.get(django_settings.OPEN_METEO_FORECAST_URL).mock(side_effect=payload)
        ensemble = mock.get(django_settings.OPEN_METEO_ENSEMBLE_URL).mock(side_effect=payload)
        yield forecast, ensemble


@pytest.fixture
def forecast_on(settings):
    settings.LOTE_FORECAST_ON_CREATE = True
    return settings


def client_for(user):
    client = APIClient()
    client.force_login(user)
    return client


def stored_cells():
    return set(ForecastSnapshot.objects.values_list("cell_lat", "cell_lon").distinct())


@time_machine.travel(NOW, tick=False)
def test_creating_a_lote_fetches_every_model_of_its_cell(
    forecast_on, open_meteo, user, django_capture_on_commit_callbacks
):
    forecast, ensemble = open_meteo

    with django_capture_on_commit_callbacks(execute=True):
        response = client_for(user).post(
            LOTES, {"name": "N", "latitude": -33.04, "longitude": -61.06}, format="json"
        )

    assert response.status_code == 201
    assert stored_cells() == {CELL}
    assert ForecastSnapshot.objects.count() == len(openmeteo.JOBS)
    assert forecast.call_count + ensemble.call_count == len(openmeteo.JOBS)


@time_machine.travel(NOW, tick=False)
def test_moving_a_lote_fetches_its_new_cell(
    forecast_on, open_meteo, user, django_capture_on_commit_callbacks
):
    lote = make_lote(user)

    with django_capture_on_commit_callbacks(execute=True):
        response = client_for(user).patch(
            f"{LOTES}{lote.pk}/", {"latitude": -34.6, "longitude": -58.4}, format="json"
        )

    assert response.status_code == 200
    assert stored_cells() == {(Decimal("-34.6"), Decimal("-58.4"))}


@time_machine.travel(NOW, tick=False)
def test_a_cell_fetched_less_than_three_hours_ago_is_skipped(open_meteo):
    forecast, ensemble = open_meteo
    for model in openmeteo.DETERMINISTIC_MODELS:
        ForecastSnapshot.objects.create(
            cell_lat=CELL[0],
            cell_lon=CELL[1],
            model=model,
            kind=openmeteo.DETERMINISTIC,
            fetch_hour=(NOW - timedelta(hours=2)).replace(minute=0),
            fetched_at=NOW - timedelta(hours=2, minutes=59),
            payload={"hourly": {}},
        )

    stats = tasks.fetch_cell_forecast("-33.04", "-61.06")

    assert stats == {"stored": 0, "skipped": 0, "failed": 0, "fresh": 1}
    assert forecast.call_count == ensemble.call_count == 0


@time_machine.travel(NOW, tick=False)
def test_a_cell_fetched_three_hours_ago_is_fetched_again(open_meteo):
    forecast, _ = open_meteo
    for model in openmeteo.DETERMINISTIC_MODELS:
        ForecastSnapshot.objects.create(
            cell_lat=CELL[0],
            cell_lon=CELL[1],
            model=model,
            kind=openmeteo.DETERMINISTIC,
            fetch_hour=(NOW - timedelta(hours=3)).replace(minute=0),
            fetched_at=NOW - timedelta(hours=3),
            payload={"hourly": {}},
        )

    stats = tasks.fetch_cell_forecast("-33.04", "-61.06")

    assert stats["stored"] == len(openmeteo.JOBS)
    assert forecast.call_count == len(openmeteo.DETERMINISTIC_MODELS)


@time_machine.travel(NOW, tick=False)
def test_a_network_error_is_logged_and_never_raised(caplog):
    with respx.mock(assert_all_called=False) as mock:
        mock.get(django_settings.OPEN_METEO_FORECAST_URL).mock(
            side_effect=httpx.ConnectError("down")
        )
        mock.get(django_settings.OPEN_METEO_ENSEMBLE_URL).mock(return_value=httpx.Response(503))

        stats = tasks.fetch_cell_forecast("-33.04", "-61.06")

    assert stats["failed"] == len(openmeteo.JOBS)
    assert ForecastSnapshot.objects.count() == 0
    assert "Open-Meteo" in caplog.text


@time_machine.travel(NOW, tick=False)
def test_the_setting_off_queues_nothing(
    settings, open_meteo, user, django_capture_on_commit_callbacks
):
    settings.LOTE_FORECAST_ON_CREATE = False
    forecast, ensemble = open_meteo

    with django_capture_on_commit_callbacks(execute=True):
        response = client_for(user).post(
            LOTES, {"name": "N", "latitude": -33.04, "longitude": -61.06}, format="json"
        )

    assert response.status_code == 201
    assert forecast.call_count == ensemble.call_count == 0


def test_a_queue_outage_does_not_fail_saving_the_lote(
    forecast_on, user, monkeypatch, django_capture_on_commit_callbacks, caplog
):
    def broker_down(*args, **kwargs):
        raise OperationalError("Connection refused")

    monkeypatch.setattr(tasks.fetch_cell_forecast, "delay", broker_down)

    with django_capture_on_commit_callbacks(execute=True):
        response = client_for(user).post(
            LOTES, {"name": "N", "latitude": -33.04, "longitude": -61.06}, format="json"
        )

    assert response.status_code == 201
    assert "Could not queue the forecast of lote" in caplog.text


def test_a_forecast_queue_outage_still_queues_the_history(
    forecast_on, user, monkeypatch, django_capture_on_commit_callbacks
):
    forecast_on.HISTORY_BACKFILL_ON_CREATE = True
    queued = []

    def broker_down(*args, **kwargs):
        raise OperationalError("Connection refused")

    monkeypatch.setattr(tasks.fetch_cell_forecast, "delay", broker_down)
    monkeypatch.setattr(tasks.backfill_history, "delay", lambda *args: queued.append(args))

    with django_capture_on_commit_callbacks(execute=True) as callbacks:
        client_for(user).post(
            LOTES, {"name": "N", "latitude": -33.04, "longitude": -61.06}, format="json"
        )

    assert len(callbacks) == 1
    assert [tuple(map(Decimal, args)) for args in queued] == [
        (Decimal("-33.04"), Decimal("-61.06"))
    ]


@time_machine.travel(NOW, tick=False)
def test_fresh_forecasts_of_a_lote_with_rules_queue_the_alert_evaluation(
    open_meteo, user, monkeypatch
):
    from apps.alerts.models import AlertRule

    evaluations = []
    monkeypatch.setattr(tasks.evaluate_rules, "delay", lambda: evaluations.append(1))
    lote = make_lote(user)

    tasks.fetch_cell_forecast(str(lote.latitude), str(lote.longitude))
    assert evaluations == []  # a lote without rules has nothing to evaluate

    AlertRule.objects.create(
        user=user, lote=lote, variable="temp_min", comparator="lt", threshold=2
    )
    ForecastSnapshot.objects.all().delete()
    tasks.fetch_cell_forecast(str(lote.latitude), str(lote.longitude))
    assert evaluations == [1]
