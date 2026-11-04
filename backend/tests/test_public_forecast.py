"""GET /api/pronostico/?lat=&lon= (S10): the public forecast of any point in Argentina."""

from datetime import timedelta

import httpx
import pytest
import respx
import time_machine
from django.conf import settings
from django.core.cache import cache

from apps.accounts.throttling import IPScopedRateThrottle
from apps.archiver.models import ForecastSnapshot
from apps.weather import ondemand
from tests.test_pronostico import CELL, FETCHED, NOW, archive, deterministic, make_lote

pytestmark = pytest.mark.django_db

URL = "/api/pronostico/"
POINT = {"lat": "-33.04", "lon": "-61.06"}  # falls in CELL
OUTSIDE = {"detail": "Por ahora solo cubrimos Argentina."}
UNAVAILABLE = {"detail": "No pudimos obtener el pronóstico. Probá en un rato."}
S5_KEYS = {
    "fetched_at",
    "models",
    "now",
    "today",
    "rain_past_7d_mm",
    "daily",
    "hourly",
    "decisions",
}
UBICACION = {
    "ubicacion": {
        "provincia": {"id": "82", "nombre": "Santa Fe"},
        "departamento": {"id": "82035", "nombre": "Constitución"},
        "municipio": {"id": "820140", "nombre": "Peyrano"},
        "lat": -33.04,
        "lon": -61.06,
    }
}


@pytest.fixture
def providers():
    """Open-Meteo and Georef mocked; every test decides what Open-Meteo answers."""
    with respx.mock(assert_all_called=False) as mock:
        routes = {
            "forecast": mock.get(settings.OPEN_METEO_FORECAST_URL),
            "ensemble": mock.get(settings.OPEN_METEO_ENSEMBLE_URL),
            "reverse": mock.get(f"{settings.GEOREF_API_URL}/ubicacion").mock(
                return_value=httpx.Response(200, json=UBICACION)
            ),
        }
        routes["forecast"].mock(return_value=httpx.Response(200, json=deterministic(22.0)))
        routes["ensemble"].mock(return_value=httpx.Response(500))
        yield routes


def deterministic_rows(fetch_hour):
    return ForecastSnapshot.objects.filter(
        kind=ForecastSnapshot.Kind.DETERMINISTIC,
        cell_lat=CELL[0],
        cell_lon=CELL[1],
        fetch_hour=fetch_hour,
    )


@pytest.mark.parametrize(
    "params",
    [
        {"lat": "40.4", "lon": "-3.7"},  # Madrid
        {"lat": "-20.9", "lon": "-60"},  # just north of the bounds
        {"lat": "-33", "lon": "-52.9"},  # just east of the bounds
    ],
)
def test_outside_argentina_is_400_with_detail(api_client, providers, params):
    response = api_client.get(URL, params)

    assert response.status_code == 400
    assert response.json() == OUTSIDE
    assert not providers["forecast"].called
    assert ForecastSnapshot.objects.count() == 0


@pytest.mark.parametrize(
    "params", [{}, {"lat": "-33"}, {"lat": "abc", "lon": "-61"}, {"lat": "nan", "lon": "-61"}]
)
def test_missing_or_invalid_coordinates_are_400(api_client, providers, params):
    response = api_client.get(URL, params)

    assert response.status_code == 400
    assert response.json() == {"detail": "Indicá lat y lon como números."}
    assert not providers["forecast"].called


@time_machine.travel(FETCHED + timedelta(hours=1), tick=False)
def test_fresh_archive_is_served_without_calling_open_meteo(api_client, providers):
    archive()  # fetched 1 h ago

    response = api_client.get(URL, POINT)

    assert response.status_code == 200
    body = response.json()
    assert set(body) == S5_KEYS | {"place"}
    assert body["fetched_at"] == "2026-11-03T12:00:00-03:00"
    assert body["models"] == ["ecmwf_ifs025", "gfs_seamless", "icon_seamless"]
    assert len(body["daily"]) == 7
    assert len(body["hourly"]) == 48
    assert body["decisions"]["engine_version"] == "v0"
    assert not providers["forecast"].called
    assert not providers["ensemble"].called


@time_machine.travel(NOW, tick=False)
def test_place_is_filled_by_the_reverse_lookup(api_client, providers):
    archive()

    body = api_client.get(URL, POINT).json()

    assert body["place"] == {"name": "Peyrano", "region": "Constitución, Santa Fe"}
    request = providers["reverse"].calls.last.request
    assert request.url.params["lat"] == "-33.04"
    assert request.url.params["lon"] == "-61.06"


@time_machine.travel(NOW, tick=False)
def test_place_is_null_when_the_places_provider_fails(api_client, providers):
    archive()
    providers["reverse"].mock(side_effect=httpx.ConnectError("down"))

    response = api_client.get(URL, POINT)

    assert response.status_code == 200
    assert response.json()["place"] is None


@time_machine.travel(NOW, tick=False)
def test_stale_archive_is_refreshed_on_demand_and_archived(api_client, providers):
    archive()  # fetched 3 h 20 min ago

    response = api_client.get(URL, POINT)

    assert response.status_code == 200
    body = response.json()
    assert body["fetched_at"] == "2026-11-03T15:20:00-03:00"
    assert body["now"]["temperature_c"] == 22.0  # the three fresh runs agree
    rows = deterministic_rows(NOW.replace(minute=0))
    assert sorted(rows.values_list("model", flat=True)) == [
        "ecmwf_ifs025",
        "gfs_seamless",
        "icon_seamless",
    ]
    assert providers["forecast"].call_count == 3
    request = providers["forecast"].calls.last.request
    assert request.url.params["latitude"] == "-33.0"
    assert request.url.params["longitude"] == "-61.1"
    assert request.url.params["past_days"] == "7"
    assert not providers["ensemble"].called  # ensembles stay with the scheduled archiver
    # Archived ensembles still give probabilities.
    assert body["daily"][2]["rain_probability_pct"] is not None


@time_machine.travel(NOW, tick=False)
def test_a_never_seen_cell_is_fetched_with_null_probabilities(api_client, providers):
    response = api_client.get(URL, POINT)

    assert response.status_code == 200
    body = response.json()
    assert set(body) == S5_KEYS | {"place"}
    assert all(day["rain_probability_pct"] is None for day in body["daily"])
    assert all(hour["rain_probability_pct"] is None for hour in body["hourly"])
    assert deterministic_rows(NOW.replace(minute=0)).count() == 3


@time_machine.travel(NOW, tick=False)
def test_on_demand_fetch_is_idempotent_within_the_hour(api_client, providers):
    api_client.get(URL, POINT)
    with time_machine.travel(NOW + timedelta(minutes=30), tick=False):
        api_client.get(URL, POINT)  # fresh now: served from the archive

    assert providers["forecast"].call_count == 3
    assert ForecastSnapshot.objects.count() == 3


@pytest.mark.parametrize(
    "failure", [httpx.ConnectError("down"), httpx.Response(500), httpx.Response(200, text="x")]
)
@time_machine.travel(NOW, tick=False)
def test_network_failure_serves_the_latest_older_snapshot(api_client, providers, failure):
    archive()
    providers["forecast"].mock(
        **(
            {"side_effect": failure}
            if isinstance(failure, Exception)
            else {"return_value": failure}
        )
    )

    response = api_client.get(URL, POINT)

    assert response.status_code == 200
    assert response.json()["fetched_at"] == "2026-11-03T12:00:00-03:00"
    assert ForecastSnapshot.objects.count() == 6  # nothing new stored


@time_machine.travel(NOW, tick=False)
def test_network_failure_without_archive_is_503(api_client, providers):
    providers["forecast"].mock(side_effect=httpx.ConnectError("down"))

    response = api_client.get(URL, POINT)

    assert response.status_code == 503
    assert response.json() == UNAVAILABLE
    assert ForecastSnapshot.objects.count() == 0


@time_machine.travel(NOW, tick=False)
def test_a_cell_being_fetched_by_another_request_is_not_fetched_twice(
    api_client, providers, monkeypatch
):
    archive()
    monkeypatch.setattr(ondemand, "LOCK_WAIT_SECONDS", 0)
    cache.add(ondemand.fetch_lock_key(CELL), "busy", 60)  # another request holds the lock

    response = api_client.get(URL, POINT)

    assert response.status_code == 200
    assert response.json()["fetched_at"] == "2026-11-03T12:00:00-03:00"
    assert not providers["forecast"].called


@time_machine.travel(NOW, tick=False)
def test_the_lock_is_released_after_fetching(api_client, providers):
    providers["forecast"].mock(side_effect=httpx.ConnectError("down"))
    api_client.get(URL, POINT)

    assert cache.get(ondemand.fetch_lock_key(CELL)) is None


def test_is_throttled_per_ip(api_client, providers, monkeypatch):
    monkeypatch.setitem(IPScopedRateThrottle.THROTTLE_RATES, "public_forecast", "2/hour")
    outside = {"lat": "40", "lon": "-3"}

    statuses = [api_client.get(URL, outside).status_code for _ in range(3)]
    other_ip = api_client.get(URL, outside, REMOTE_ADDR="10.0.0.9").status_code

    assert statuses == [400, 400, 429]
    assert other_ip == 400


def test_default_rate_is_60_per_hour():
    assert IPScopedRateThrottle.THROTTLE_RATES["public_forecast"] == "60/hour"


@time_machine.travel(NOW, tick=False)
def test_per_lote_forecast_still_reads_only_the_archive(auth_client, user, providers):
    """The lote endpoint (S5) keeps its behavior: stale archive served, no fetch, no place."""
    archive()

    body = auth_client.get(f"/api/lotes/{make_lote(user).id}/pronostico/").json()

    assert set(body) == S5_KEYS
    assert body["fetched_at"] == "2026-11-03T12:00:00-03:00"
    assert not providers["forecast"].called
    assert not providers["reverse"].called
