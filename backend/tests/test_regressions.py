"""Independent verifier probes (scratch only)."""

import hashlib
from datetime import UTC, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
import pytest
import respx
import time_machine
from django.conf import settings
from rest_framework.test import APIClient

from apps.archiver.models import ForecastSnapshot, Observation
from apps.archiver.tasks import fetch_forecasts, fetch_smn_observations
from apps.lotes.models import Lote

pytestmark = pytest.mark.django_db
ART = ZoneInfo("America/Argentina/Buenos_Aires")
FIXTURE = Path(__file__).parent / "fixtures" / "datohorario20261102.txt"
SMN = "https://ssl.smn.gob.ar/dpd/descarga_opendata.php"
NOW = datetime(2026, 11, 3, 12, 7, tzinfo=UTC)


def table_hash(model):
    rows = sorted(str(r) for r in model.objects.values_list())
    return hashlib.md5("|".join(rows).encode()).hexdigest()


def ok(request):
    return httpx.Response(
        200, json={"hourly": {"time": ["2026-11-03T21:00"], "temperature_2m": [1.0]}}
    )


@time_machine.travel(NOW, tick=False)
def test_forecast_twice_no_duplicates(user):
    Lote.objects.create(user=user, name="L", latitude=-33.04, longitude=-61.06)
    with respx.mock(assert_all_called=False) as m:
        m.get(settings.OPEN_METEO_FORECAST_URL).mock(side_effect=ok)
        m.get(settings.OPEN_METEO_ENSEMBLE_URL).mock(side_effect=ok)
        s1 = fetch_forecasts()
        n = ForecastSnapshot.objects.count()
        s2 = fetch_forecasts()
    assert n == 4 * 5 and ForecastSnapshot.objects.count() == n
    assert s1["stored"] == 20 and s2 == {"stored": 0, "skipped": 20, "failed": 0}


@pytest.mark.parametrize(
    "side_effect",
    [
        httpx.ConnectError("down"),
        httpx.ReadTimeout("slow"),
        httpx.RemoteProtocolError("bad"),
        lambda r: httpx.Response(502, text="bad gateway"),
        lambda r: httpx.Response(200, text="<html>not json"),
        lambda r: httpx.Response(200, json={"error": True, "reason": "x"}),
        lambda r: httpx.Response(200, json=[1, 2]),
    ],
)
@time_machine.travel(NOW, tick=False)
def test_forecast_network_failure_no_exception_nothing_stored(side_effect):
    with respx.mock(assert_all_called=False) as m:
        m.get(settings.OPEN_METEO_FORECAST_URL).mock(side_effect=side_effect)
        m.get(settings.OPEN_METEO_ENSEMBLE_URL).mock(side_effect=side_effect)
        stats = fetch_forecasts()
    assert stats == {"stored": 0, "skipped": 0, "failed": 15}
    assert ForecastSnapshot.objects.count() == 0


@time_machine.travel(NOW, tick=False)
def test_forecast_mixed_failure_stores_only_complete_payloads():
    calls = {"n": 0}

    def flaky(request):
        calls["n"] += 1
        if calls["n"] % 2:
            raise httpx.ConnectError("down")
        return ok(request)

    with respx.mock(assert_all_called=False) as m:
        m.get(settings.OPEN_METEO_FORECAST_URL).mock(side_effect=flaky)
        m.get(settings.OPEN_METEO_ENSEMBLE_URL).mock(side_effect=flaky)
        stats = fetch_forecasts()
        assert stats["failed"] + stats["stored"] == 15
        assert all(
            "hourly" in p for p in ForecastSnapshot.objects.values_list("payload", flat=True)
        )
        # retry in the same hour fills the gaps without duplicates
        m.get(settings.OPEN_METEO_FORECAST_URL).mock(side_effect=ok)
        m.get(settings.OPEN_METEO_ENSEMBLE_URL).mock(side_effect=ok)
        fetch_forecasts()
    assert ForecastSnapshot.objects.count() == 15


@time_machine.travel(datetime(2026, 11, 3, 3, 0, tzinfo=ART), tick=False)
def test_smn_fixture_idempotent_and_missing_file_body():
    body = FIXTURE.read_bytes()
    with respx.mock as m:
        route = m.get(url__startswith=SMN)
        route.side_effect = [
            httpx.Response(200, content=body),
            httpx.Response(200, content=b"El archivo no existe."),
            httpx.ConnectError("down"),
        ]
        s1 = fetch_smn_observations()
    n = Observation.objects.count()
    names = set(Observation.objects.values_list("station_name", flat=True))
    assert n > 0 and names <= {"ROSARIO AERO", "VENADO TUERTO AERO", "MARCOS JUAREZ AERO"}
    assert s1 == {"stored": n, "failed_days": 2}
    h = table_hash(Observation)
    with respx.mock as m:
        m.get(url__startswith=SMN).mock(return_value=httpx.Response(200, content=body))
        s2 = fetch_smn_observations()
    assert s2["stored"] == 0 and Observation.objects.count() == n
    assert table_hash(Observation) == h


@time_machine.travel(datetime(2026, 11, 3, 3, 0, tzinfo=ART), tick=False)
def test_smn_only_missing_file_bodies_store_nothing():
    with respx.mock as m:
        m.get(url__startswith=SMN).mock(
            return_value=httpx.Response(200, content="El archivo no existe.".encode("latin-1"))
        )
        stats = fetch_smn_observations()
    assert stats == {"stored": 0, "failed_days": 3}
    assert Observation.objects.count() == 0


def _login(user):
    c = APIClient()
    c.force_login(user)
    return c


@pytest.mark.parametrize("value", ["", None])
def test_crop_empty_is_null(user, value):
    """S8: crop is `enum or null`; "" must not be stored or returned as ""."""
    c = _login(user)
    r = c.post(
        "/api/lotes/",
        {"name": "L", "latitude": -33, "longitude": -61, "crop": value},
        format="json",
    )
    assert r.status_code in (201, 400)
    if r.status_code == 201:
        assert r.json()["crop"] is None
        assert Lote.objects.get().crop is None


def test_huge_latitude_is_400_not_500(user):
    c = _login(user)
    c.raise_request_exception = False
    r = c.post("/api/lotes/", {"name": "L", "latitude": "1e30", "longitude": -61}, format="json")
    assert r.status_code == 400
    assert Lote.objects.count() == 0


def test_login_throttle_not_bypassed_by_spoofed_xff(user):
    """B1: TRUSTED_PROXY_COUNT=0 must mean REMOTE_ADDR, never "trust X-Forwarded-For"."""
    assert settings.REST_FRAMEWORK["NUM_PROXIES"] == 0
    from rest_framework.settings import api_settings

    api_settings.reload()
    try:
        c = APIClient()
        statuses = [
            c.post(
                "/api/auth/login/",
                {"email": user.email, "password": "wrong"},
                format="json",
                HTTP_X_FORWARDED_FOR=f"10.0.0.{i}",
            ).status_code
            for i in range(12)
        ]
    finally:
        api_settings.reload()
    assert 429 in statuses
