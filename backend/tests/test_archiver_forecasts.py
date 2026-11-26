from datetime import UTC, datetime
from decimal import Decimal

import httpx
import pytest
import respx
import time_machine
from django.conf import settings

from apps.alerts import tasks as alert_tasks
from apps.archiver import openmeteo
from apps.archiver.models import ForecastSnapshot
from apps.archiver.tasks import fetch_forecasts
from apps.lotes.models import Lote

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 11, 3, 12, 7, tzinfo=UTC)
STATION_CELLS = {
    (Decimal("-32.9"), Decimal("-60.8")),  # Rosario Aero
    (Decimal("-33.7"), Decimal("-62.0")),  # Venado Tuerto Aero
    (Decimal("-32.7"), Decimal("-62.2")),  # Marcos Juárez Aero
}


def payload(request):
    return httpx.Response(
        200,
        json={
            "latitude": float(request.url.params["latitude"]),
            "hourly": {"time": ["2026-11-03T00:00"], "temperature_2m": [12.3]},
        },
    )


@pytest.fixture
def open_meteo():
    with respx.mock(assert_all_called=False) as mock:
        forecast = mock.get(settings.OPEN_METEO_FORECAST_URL).mock(side_effect=payload)
        ensemble = mock.get(settings.OPEN_METEO_ENSEMBLE_URL).mock(side_effect=payload)
        yield forecast, ensemble


def stored_cells():
    return set(ForecastSnapshot.objects.values_list("cell_lat", "cell_lon").distinct())


@time_machine.travel(NOW, tick=False)
def test_stores_every_model_for_station_and_lote_cells(open_meteo, user):
    forecast, ensemble = open_meteo
    Lote.objects.create(
        user=user, name="L", latitude=Decimal("-33.04"), longitude=Decimal("-61.06")
    )
    Lote.objects.create(
        user=user, name="Mismo", latitude=Decimal("-33.01"), longitude=Decimal("-61.1")
    )

    stats = fetch_forecasts()

    cells = STATION_CELLS | {(Decimal("-33.0"), Decimal("-61.1"))}
    assert stored_cells() == cells
    assert stats == {"stored": 20, "skipped": 0, "failed": 0}
    assert forecast.call_count == 4 * 3
    assert ensemble.call_count == 4 * 2
    rows = set(ForecastSnapshot.objects.values_list("model", "kind").distinct())
    assert rows == {
        ("ecmwf_ifs025", "deterministic"),
        ("gfs_seamless", "deterministic"),
        ("icon_seamless", "deterministic"),
        ("ecmwf_ifs025", "ensemble"),
        ("gfs025", "ensemble"),
    }
    snap = ForecastSnapshot.objects.filter(cell_lat=Decimal("-33.0"), model="icon_seamless").get()
    assert snap.payload["hourly"]["temperature_2m"] == [12.3]
    assert snap.fetched_at == NOW
    assert snap.fetch_hour == datetime(2026, 11, 3, 12, 0, tzinfo=UTC)


@time_machine.travel(NOW, tick=False)
def test_request_parameters(open_meteo):
    forecast, ensemble = open_meteo

    fetch_forecasts()

    params = forecast.calls[0].request.url.params
    assert params["timezone"] == "America/Argentina/Buenos_Aires"
    assert params["forecast_days"] == "7"
    assert params["hourly"].split(",") == list(openmeteo.DETERMINISTIC_HOURLY)
    assert "temperature_2m" in params["hourly"]
    assert "apikey" not in params
    assert {
        (c.request.url.params["latitude"], c.request.url.params["longitude"])
        for c in forecast.calls
    } == {(str(lat), str(lon)) for lat, lon in STATION_CELLS}
    ens_params = ensemble.calls[0].request.url.params
    assert ens_params["hourly"].split(",") == list(openmeteo.ENSEMBLE_HOURLY)


@time_machine.travel(NOW, tick=False)
def test_deterministic_requests_add_past_rain_sun_times_and_sky(open_meteo):
    forecast, ensemble = open_meteo

    fetch_forecasts()

    params = forecast.calls[0].request.url.params
    assert params["past_days"] == "7"
    assert params["daily"] == "sunrise,sunset"
    hourly = params["hourly"].split(",")
    for variable in (
        "precipitation",
        "relative_humidity_2m",
        "wind_direction_10m",
        "wind_gusts_10m",
        "cloud_cover",
        "cloud_cover_low",
        "weather_code",
        "wet_bulb_temperature_2m",
        "dew_point_2m",
        "temperature_80m",
    ):
        assert variable in hourly
    # Ensembles only feed rain probabilities: no past days, no daily block.
    ens_params = ensemble.calls[0].request.url.params
    assert "past_days" not in ens_params
    assert "daily" not in ens_params
    assert ens_params["forecast_days"] == "7"


@time_machine.travel(NOW, tick=False)
def test_api_key_and_base_url_from_settings(settings):
    settings.OPEN_METEO_FORECAST_URL = "https://customer-api.open-meteo.com/v1/forecast"
    settings.OPEN_METEO_ENSEMBLE_URL = "https://customer-ensemble-api.open-meteo.com/v1/ensemble"
    settings.OPEN_METEO_API_KEY = "secret-key"
    with respx.mock() as mock:
        forecast = mock.get(settings.OPEN_METEO_FORECAST_URL).mock(side_effect=payload)
        ensemble = mock.get(settings.OPEN_METEO_ENSEMBLE_URL).mock(side_effect=payload)

        fetch_forecasts()

    assert forecast.call_count == 9
    assert ensemble.call_count == 6
    assert all(c.request.url.params["apikey"] == "secret-key" for c in forecast.calls)


def test_second_run_in_the_same_hour_is_a_no_op(open_meteo):
    forecast, ensemble = open_meteo
    with time_machine.travel(NOW, tick=False):
        fetch_forecasts()
    with time_machine.travel(NOW.replace(minute=55), tick=False):
        stats = fetch_forecasts()

    assert stats == {"stored": 0, "skipped": 15, "failed": 0}
    assert ForecastSnapshot.objects.count() == 15
    assert forecast.call_count + ensemble.call_count == 15


def test_next_slot_stores_a_new_snapshot(open_meteo):
    # 09:07 and 15:00 in Buenos Aires: the 06:00 and the 12:00 slots.
    with time_machine.travel(NOW, tick=False):
        fetch_forecasts()
    with time_machine.travel(NOW.replace(hour=18), tick=False):
        fetch_forecasts()

    assert ForecastSnapshot.objects.count() == 30


def test_a_later_hour_of_the_same_slot_is_a_no_op(open_meteo):
    forecast, ensemble = open_meteo
    # 09:07 and 11:00 in Buenos Aires: both in the 06:00 slot.
    with time_machine.travel(NOW, tick=False):
        fetch_forecasts()
    with time_machine.travel(NOW.replace(hour=14, minute=0), tick=False):
        stats = fetch_forecasts()

    assert stats == {"stored": 0, "skipped": 15, "failed": 0}
    assert ForecastSnapshot.objects.count() == 15
    assert forecast.call_count + ensemble.call_count == 15


def test_a_missed_slot_is_caught_up_at_the_next_hourly_run(open_meteo):
    # The stack was down: the last archive is from yesterday's 18:00 slot (21:00 UTC).
    with time_machine.travel(datetime(2026, 11, 2, 21, 0, tzinfo=UTC), tick=False):
        fetch_forecasts()
    # It comes back at 09:07 in Buenos Aires, between the 06:00 and the 12:00 runs.
    with time_machine.travel(NOW, tick=False):
        stats = fetch_forecasts()

    assert stats == {"stored": 15, "skipped": 0, "failed": 0}


def test_a_failed_job_is_retried_at_the_next_hour_of_its_slot():
    with respx.mock() as mock, time_machine.travel(NOW, tick=False):
        mock.get(settings.OPEN_METEO_FORECAST_URL).mock(side_effect=payload)
        mock.get(settings.OPEN_METEO_ENSEMBLE_URL).mock(return_value=httpx.Response(429))
        assert fetch_forecasts() == {"stored": 9, "skipped": 0, "failed": 6}

    with respx.mock(assert_all_called=False) as mock:
        forecast = mock.get(settings.OPEN_METEO_FORECAST_URL).mock(side_effect=payload)
        mock.get(settings.OPEN_METEO_ENSEMBLE_URL).mock(side_effect=payload)
        with time_machine.travel(NOW.replace(hour=13, minute=0), tick=False):
            stats = fetch_forecasts()

    assert stats == {"stored": 6, "skipped": 9, "failed": 0}
    assert forecast.call_count == 0  # the deterministic models were already in this slot
    assert set(
        ForecastSnapshot.objects.filter(kind="ensemble").values_list("fetch_hour", flat=True)
    ) == {datetime(2026, 11, 3, 13, 0, tzinfo=UTC)}


def test_a_run_that_stores_nothing_does_not_evaluate_the_alerts(open_meteo, monkeypatch):
    with time_machine.travel(NOW, tick=False):
        fetch_forecasts()
    queued = []
    monkeypatch.setattr(alert_tasks.evaluate_rules, "delay", lambda: queued.append(True))
    with time_machine.travel(NOW.replace(hour=14, minute=0), tick=False):
        fetch_forecasts()

    assert queued == []


def test_a_snapshot_from_before_the_slot_is_fetched_again(open_meteo):
    # 05:00 in Buenos Aires (an on-demand search, say) belongs to the 00:00 slot.
    with time_machine.travel(NOW.replace(hour=8, minute=0), tick=False):
        fetch_forecasts()
    with time_machine.travel(NOW, tick=False):
        stats = fetch_forecasts()

    assert stats == {"stored": 15, "skipped": 0, "failed": 0}


@time_machine.travel(NOW, tick=False)
@pytest.mark.parametrize(
    "failure",
    [
        httpx.ConnectError("no network"),
        httpx.ReadTimeout("slow"),
        httpx.Response(500, text="boom"),
        httpx.Response(400, json={"error": True, "reason": "bad"}),
        httpx.Response(200, text="not json"),
    ],
    ids=["connect", "timeout", "500", "400", "invalid-json"],
)
def test_network_failure_logs_and_keeps_going(failure, caplog):
    with respx.mock() as mock:
        mock.get(settings.OPEN_METEO_FORECAST_URL).mock(
            side_effect=failure if isinstance(failure, Exception) else None,
            return_value=None if isinstance(failure, Exception) else failure,
        )
        mock.get(settings.OPEN_METEO_ENSEMBLE_URL).mock(side_effect=payload)

        stats = fetch_forecasts()

    assert stats == {"stored": 6, "skipped": 0, "failed": 9}
    assert set(ForecastSnapshot.objects.values_list("kind", flat=True)) == {"ensemble"}
    assert "Open-Meteo deterministic" in caplog.text


def test_failed_fetch_is_retried_on_the_next_run():
    with respx.mock() as mock, time_machine.travel(NOW, tick=False):
        mock.get(settings.OPEN_METEO_FORECAST_URL).mock(side_effect=httpx.ConnectError("down"))
        mock.get(settings.OPEN_METEO_ENSEMBLE_URL).mock(side_effect=httpx.ConnectError("down"))
        assert fetch_forecasts()["failed"] == 15

    with respx.mock() as mock, time_machine.travel(NOW.replace(minute=30), tick=False):
        mock.get(settings.OPEN_METEO_FORECAST_URL).mock(side_effect=payload)
        mock.get(settings.OPEN_METEO_ENSEMBLE_URL).mock(side_effect=payload)
        assert fetch_forecasts() == {"stored": 15, "skipped": 0, "failed": 0}


def test_beat_schedule():
    schedule = settings.CELERY_BEAT_SCHEDULE

    forecasts = schedule["archive-forecasts"]
    assert forecasts["task"] == "archiver.fetch_forecasts"
    # Hourly: each run fetches only what its 6-hour slot lacks, so a missed slot is caught up.
    assert forecasts["schedule"].hour == set(range(24))
    assert forecasts["schedule"].minute == {0}
    smn = schedule["archive-smn-observations"]
    assert smn["task"] == "archiver.fetch_smn_observations"
    assert smn["schedule"].minute == {10}
    assert smn["schedule"].hour == set(range(24))  # hourly (auditoria-historico S5)
    assert settings.CELERY_TIMEZONE == "America/Argentina/Buenos_Aires"
