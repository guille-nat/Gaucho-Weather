"""GET /api/lotes/{id}/pronostico/ (S5) and the lote card headline."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
import time_machine

from apps.archiver.models import ForecastSnapshot
from apps.lotes.models import Lote

pytestmark = pytest.mark.django_db

CELL = (Decimal("-33.0"), Decimal("-61.1"))
NOW = datetime(2026, 11, 3, 18, 20, tzinfo=UTC)  # 15:20 in Buenos Aires
FETCHED = datetime(2026, 11, 3, 15, 0, tzinfo=UTC)
FIRST_DAY = date(2026, 10, 27)  # past_days=7
DAYS = 14
OFFSET = "-03:00"
NOT_FOUND = {"detail": "Todavía no hay pronóstico para este lote."}


def stamps():
    start = datetime(2026, 10, 27, 0, 0)
    return [(start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(DAYS * 24)]


def deterministic(temp, rain=None, gust=20.0, t80=True):
    """A calm, dry, half-cloudy fortnight at `temp` °C; 05:00 tonight drops to 1 °C."""
    times = stamps()
    rain = rain or {}
    temps = [1.0 if t == "2026-11-04T05:00" else temp for t in times]
    hourly = {
        "time": times,
        "temperature_2m": temps,
        "relative_humidity_2m": [60] * len(times),
        "dew_point_2m": [t - 10 for t in temps],
        "wet_bulb_temperature_2m": [t - 5 for t in temps],
        "precipitation": [rain.get(t, 0.0) for t in times],
        "wind_speed_10m": [8.0 if "T2" in t or "T0" in t else 13.0 for t in times],
        "wind_direction_10m": [350] * len(times),
        "wind_gusts_10m": [gust] * len(times),
        "cloud_cover": [50] * len(times),
        "cloud_cover_low": [10] * len(times),
        "temperature_80m": [t - 1 for t in temps] if t80 else [None] * len(times),
        "weather_code": [2] * len(times),
    }
    days = [FIRST_DAY + timedelta(days=i) for i in range(DAYS)]
    daily = {
        "time": [d.isoformat() for d in days],
        "sunrise": [f"{d.isoformat()}T06:12" for d in days],
        "sunset": [f"{d.isoformat()}T19:50" for d in days],
    }
    return {"hourly": hourly, "daily": daily, "timezone": "America/Argentina/Buenos_Aires"}


def ensemble(wet_members_by_stamp, members=4):
    """168 hours from today; `wet_members_by_stamp` maps a stamp to (count, mm)."""
    start = datetime(2026, 11, 3, 0, 0)
    times = [(start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(168)]
    keys = ["precipitation"] + [f"precipitation_member{i:02d}" for i in range(1, members)]
    hourly = {"time": times, "temperature_2m": [10.0] * len(times)}
    for index, key in enumerate(keys):
        values = []
        for stamp in times:
            count, mm = wet_members_by_stamp.get(stamp, (0, 0.0))
            values.append(mm if index < count else 0.0)
        hourly[key] = values
    return {"hourly": hourly}


def store(model, kind, payload, fetched_at=FETCHED, cell=CELL):
    return ForecastSnapshot.objects.create(
        cell_lat=cell[0],
        cell_lon=cell[1],
        model=model,
        kind=kind,
        fetched_at=fetched_at,
        fetch_hour=fetched_at.replace(minute=0, second=0, microsecond=0),
        payload=payload,
    )


def archive(with_ensembles=True, cell=CELL):
    det = ForecastSnapshot.Kind.DETERMINISTIC
    past_rain = {
        "2026-10-27T10:00": 10.0,  # more than 7 days ago
        "2026-10-30T10:00": 1.5,
        "2026-11-03T14:00": 2.5,
        "2026-11-03T16:00": 4.0,  # still to come
    }
    thursday = {"2026-11-05T10:00": 6.0, "2026-11-05T11:00": 6.0}
    store("ecmwf_ifs025", det, deterministic(20.0, {**past_rain, **thursday}, t80=False), cell=cell)
    store("gfs_seamless", det, deterministic(21.0, {"2026-11-05T10:00": 10.0}), cell=cell)
    store("icon_seamless", det, deterministic(24.0, {"2026-10-30T10:00": 50.0}), cell=cell)
    # An older ECMWF run must lose to the latest one.
    store("ecmwf_ifs025", det, deterministic(-10.0), FETCHED - timedelta(hours=6), cell=cell)
    if with_ensembles:
        ens = ForecastSnapshot.Kind.ENSEMBLE
        store(
            "ecmwf_ifs025",
            ens,
            ensemble({"2026-11-05T10:00": (3, 2.0), "2026-11-03T18:00": (2, 1.0)}),
            cell=cell,
        )
        store("gfs025", ens, ensemble({"2026-11-05T12:00": (1, 5.0)}), cell=cell)


def make_lote(user, latitude="-33.04", longitude="-61.06", name="Lote"):
    return Lote.objects.create(
        user=user, name=name, latitude=Decimal(latitude), longitude=Decimal(longitude)
    )


def url(lote):
    return f"/api/lotes/{lote.id}/pronostico/"


@time_machine.travel(NOW, tick=False)
def test_payload_shape_matches_the_contract(auth_client, user):
    archive()
    body = auth_client.get(url(make_lote(user))).json()

    assert set(body) == {
        "fetched_at",
        "models",
        "now",
        "today",
        "rain_past_7d_mm",
        "daily",
        "hourly",
        "decisions",
    }
    assert body["fetched_at"] == "2026-11-03T12:00:00-03:00"
    assert body["models"] == ["ecmwf_ifs025", "gfs_seamless", "icon_seamless"]
    assert set(body["now"]) == {
        "time",
        "temperature_c",
        "humidity_pct",
        "wind_kmh",
        "wind_dir_deg",
        "gust_kmh",
    }
    assert set(body["today"]) == {"max_c", "min_c", "sunrise", "sunset"}
    assert len(body["daily"]) == 7
    for day in body["daily"]:
        assert set(day) == {"date", "max_c", "min_c", "rain_mm", "rain_probability_pct", "sky"}
        assert day["sky"] in {"sol", "parcial", "nublado", "lluvia", "tormenta"}
    assert len(body["hourly"]) == 48
    for hour in body["hourly"]:
        assert set(hour) == {
            "time",
            "temperature_c",
            "humidity_pct",
            "wind_kmh",
            "gust_kmh",
            "rain_mm",
            "rain_probability_pct",
        }
    decisions = body["decisions"]
    assert set(decisions) == {
        "frost_tonight",
        "spray_today",
        "field_work",
        "engine_version",
        "validated",
    }
    assert set(decisions["frost_tonight"]) == {
        "level",
        "min_2m_c",
        "ground_estimate_c",
        "models_agreeing",
        "reason",
    }
    assert set(decisions["spray_today"]) == {"level", "best_window", "reason"}
    assert set(decisions["field_work"]) == {"level", "next_rain", "reason"}
    assert decisions["engine_version"] == "v0"
    assert decisions["validated"] is False
    for verdict in ("frost_tonight", "spray_today", "field_work"):
        assert decisions[verdict]["level"] in {"ok", "caution", "critical"}


@time_machine.travel(NOW, tick=False)
def test_values_use_the_median_across_models_in_local_time(auth_client, user):
    archive()
    body = auth_client.get(url(make_lote(user))).json()

    assert body["now"] == {
        "time": f"2026-11-03T15:00:00{OFFSET}",
        "temperature_c": 21.0,
        "humidity_pct": 60,
        "wind_kmh": 13.0,
        "wind_dir_deg": 350,  # circular mean, not 350 averaged with 0
        "gust_kmh": 20.0,
    }
    assert body["today"] == {
        "max_c": 21.0,
        "min_c": 21.0,
        "sunrise": f"2026-11-03T06:12:00{OFFSET}",
        "sunset": f"2026-11-03T19:50:00{OFFSET}",
    }
    assert [d["date"] for d in body["daily"]] == [
        (date(2026, 11, 3) + timedelta(days=i)).isoformat() for i in range(7)
    ]
    thursday = body["daily"][2]
    assert thursday["rain_mm"] == 10.0  # median of 12, 10 and 0
    assert thursday["sky"] == "lluvia"
    assert body["daily"][1]["sky"] == "parcial"
    assert body["hourly"][0]["time"] == f"2026-11-03T15:00:00{OFFSET}"
    assert body["hourly"][-1]["time"] == f"2026-11-05T14:00:00{OFFSET}"
    assert body["hourly"][1]["rain_mm"] == 0.0  # 4 mm in one model only


@time_machine.travel(NOW, tick=False)
def test_rain_past_7d_comes_from_the_preferred_model(auth_client, user):
    archive()
    body = auth_client.get(url(make_lote(user))).json()

    # ECMWF: 1.5 + 2.5; not the 10 mm of 8 days ago, the 4 mm still to come or ICON's 50.
    assert body["rain_past_7d_mm"] == 4.0


@time_machine.travel(NOW, tick=False)
def test_probabilities_are_the_mean_fraction_of_wet_members(auth_client, user):
    archive()
    body = auth_client.get(url(make_lote(user))).json()

    # ECMWF 3 of 4 members, GFS 1 of 4: equal weights.
    assert body["daily"][2]["rain_probability_pct"] == 50
    assert body["daily"][0]["rain_probability_pct"] == 25  # 2 of 4, then 0 of 4
    assert body["daily"][1]["rain_probability_pct"] == 0
    assert body["hourly"][3]["time"] == f"2026-11-03T18:00:00{OFFSET}"
    assert body["hourly"][3]["rain_probability_pct"] == 25
    assert body["hourly"][0]["rain_probability_pct"] == 0


@time_machine.travel(NOW, tick=False)
def test_probabilities_are_null_without_ensembles(auth_client, user):
    archive(with_ensembles=False)
    body = auth_client.get(url(make_lote(user))).json()

    assert {d["rain_probability_pct"] for d in body["daily"]} == {None}
    assert {h["rain_probability_pct"] for h in body["hourly"]} == {None}
    assert body["decisions"]["field_work"]["next_rain"]["probability_pct"] is None


@time_machine.travel(NOW, tick=False)
def test_decisions(auth_client, user):
    archive()
    decisions = auth_client.get(url(make_lote(user))).json()["decisions"]

    assert decisions["frost_tonight"] == {
        "level": "critical",
        "min_2m_c": 1.0,
        "ground_estimate_c": -3.0,
        "models_agreeing": "3 de 3 modelos",
        "reason": (
            "Noche despejada y calma: en el suelo puede bajar a −3 °C. 3 de 3 modelos dan helada."
        ),
    }
    assert decisions["spray_today"] == {
        "level": "ok",
        "best_window": {
            "start": f"2026-11-03T15:00:00{OFFSET}",
            "end": f"2026-11-03T20:00:00{OFFSET}",
        },
        "reason": "Buena ventana de 15 a 20 h.",
    }
    assert decisions["field_work"] == {
        "level": "caution",
        "next_rain": {"date": "2026-11-05", "mm": 10.0, "probability_pct": 50},
        "reason": "Jueves podrían caer 10 mm (50 %): adelantá las labores si podés.",
    }


def test_other_users_lote_is_404(auth_client, make_user):
    other = make_lote(make_user(email="otro@example.com"))
    archive()

    response = auth_client.get(url(other))

    assert response.status_code == 404
    assert response.json() != NOT_FOUND


def test_nothing_archived_is_404_with_detail(auth_client, user):
    lote = make_lote(user)
    store("gfs025", ForecastSnapshot.Kind.ENSEMBLE, ensemble({}))  # ensembles alone are not enough

    response = auth_client.get(url(lote))

    assert response.status_code == 404
    assert response.json() == NOT_FOUND


def test_anonymous_is_403(api_client, db):
    assert api_client.get("/api/lotes/1/pronostico/").status_code == 403


class TestHeadline:
    @time_machine.travel(NOW, tick=False)
    def test_summary_gains_the_most_urgent_decision(self, auth_client, user):
        archive()
        lote = make_lote(user)

        detail = auth_client.get(f"/api/lotes/{lote.id}/").json()["summary"]
        listed = auth_client.get("/api/lotes/").json()[0]["summary"]

        expected = {
            "level": "critical",
            "text": "Helada esta noche: en el suelo puede bajar a −3 °C.",
        }
        assert detail["headline"] == expected
        assert listed["headline"] == expected
        # The Phase 1 fields are still there.
        assert {"tonight_min_c_2m", "tonight_min_models", "fetched_at"} <= set(detail)

    @time_machine.travel(NOW, tick=False)
    def test_list_queries_do_not_grow_with_lotes(
        self, auth_client, user, django_assert_max_num_queries
    ):
        archive()
        archive(cell=(Decimal("-33.5"), Decimal("-61.5")))
        make_lote(user)
        auth_client.get("/api/lotes/")  # warm the session and auth queries
        with django_assert_max_num_queries(10) as one:
            auth_client.get("/api/lotes/")
        make_lote(user, name="Otro", latitude="-33.46", longitude="-61.48")
        make_lote(user, name="Mismo", latitude="-33.01", longitude="-61.1")
        with django_assert_max_num_queries(len(one.captured_queries)):
            body = auth_client.get("/api/lotes/").json()
        assert all(lote["summary"]["headline"] for lote in body)

    def test_null_summary_without_forecast(self, auth_client, user):
        lote = make_lote(user)

        assert auth_client.get(f"/api/lotes/{lote.id}/").json()["summary"] is None


def archive_rain_today(stamp, mm=12.0):
    for model in ("ecmwf_ifs025", "gfs_seamless", "icon_seamless"):
        store(model, ForecastSnapshot.Kind.DETERMINISTIC, deterministic(20.0, {stamp: mm}))


@time_machine.travel(datetime(2026, 11, 4, 2, 20, tzinfo=UTC), tick=False)  # 23:20 local
def test_field_work_ignores_rain_that_already_fell_today(auth_client, user):
    archive_rain_today("2026-11-03T10:00")
    body = auth_client.get(url(make_lote(user))).json()

    assert body["daily"][0]["rain_mm"] == 12.0  # the day total is still shown
    assert body["decisions"]["field_work"]["level"] == "ok"
    assert body["decisions"]["field_work"]["next_rain"] is None


@time_machine.travel(NOW, tick=False)  # 15:20 local
def test_field_work_counts_rain_still_to_come_today(auth_client, user):
    archive_rain_today("2026-11-03T18:00")
    body = auth_client.get(url(make_lote(user))).json()

    assert body["decisions"]["field_work"]["next_rain"] == {
        "date": "2026-11-03",
        "mm": 12.0,
        "probability_pct": None,
    }
