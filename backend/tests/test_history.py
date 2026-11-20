from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import httpx
import pytest
import respx
import time_machine
from celery.schedules import crontab
from rest_framework.test import APIClient

from apps.archiver import history, tasks
from apps.archiver.models import WeatherHour
from engine import rate_wind

from .test_lotes import make_lote

URL = "https://historical-forecast-api.open-meteo.com/v1/forecast"
# 2026-11-16 12:00 in Buenos Aires (UTC−3)
NOW = datetime(2026, 11, 16, 15, tzinfo=UTC)
CELL = (Decimal("-33.0"), Decimal("-61.1"))  # grid_cell of make_lote's default point
AUDIT_KEYS = (
    "temperature_80m_c",
    "wet_bulb_c",
    "cloud_cover_pct",
    "pressure_hpa",
    "radiation_wm2",
    "delta_t_c",
    "inversion",
)


def client_for(user):
    client = APIClient()
    client.force_login(user)
    return client


def stamp(moment: datetime) -> int:
    return int(moment.timestamp())


def hourly_payload(start: datetime, hours: int, **overrides):
    times = [stamp(start + timedelta(hours=i)) for i in range(hours)]
    series = {
        "temperature_2m": [20.0 + i % 5 for i in range(hours)],
        "relative_humidity_2m": [60.0] * hours,
        "dew_point_2m": [12.0] * hours,
        "precipitation": [0.0] * hours,
        "wind_speed_10m": [12.0] * hours,
        "wind_direction_10m": [180.0] * hours,
        "wind_gusts_10m": [20.0] * hours,
        "temperature_80m": [21.0] * hours,
        "wet_bulb_temperature_2m": [15.5] * hours,
        "cloud_cover": [40.0] * hours,
        "surface_pressure": [1012.4] * hours,
        "shortwave_radiation": [520.0] * hours,
    }
    series.update(overrides)
    return {"hourly": {"time": times, **series}}


def two_hours_of_the_first_day(request: httpx.Request) -> httpx.Response:
    """A provider stand-in: 00:00 and 01:00 local of the requested start date."""
    first = datetime.combine(
        date.fromisoformat(request.url.params["start_date"]),
        datetime.min.time(),
        tzinfo=history.LOCAL,
    )
    return httpx.Response(200, json=hourly_payload(first.astimezone(UTC), 2))


def requested_ranges(route) -> list[tuple[str, str]]:
    return [
        (call.request.url.params["start_date"], call.request.url.params["end_date"])
        for call in route.calls
    ]


def store_hours(start: datetime, hours: int, **values):
    for i in range(hours):
        WeatherHour.objects.create(
            cell_lat=CELL[0],
            cell_lon=CELL[1],
            time=start + timedelta(hours=i),
            source=history.SOURCE,
            fetched_at=NOW,
            temperature_c=values.get("temperature_c", 20.0),
            humidity_pct=60.0,
            dew_point_c=12.0,
            rain_mm=values.get("rain_mm", 0.0),
            wind_kmh=values.get("wind_kmh", 12.0),
            wind_dir_deg=90.0,
            gust_kmh=values.get("gust_kmh", 20.0),
            temperature_80m_c=values.get("temperature_80m_c"),
            wet_bulb_c=values.get("wet_bulb_c"),
            cloud_cover_pct=values.get("cloud_cover_pct"),
            pressure_hpa=values.get("pressure_hpa"),
            radiation_wm2=values.get("radiation_wm2"),
        )


class TestRateWind:
    def test_a_calm_breeze_is_fine_for_spraying(self):
        assert rate_wind(12.0, 20.0) == ("ok", ())

    def test_too_little_or_too_much_wind_and_strong_gusts(self):
        assert rate_wind(2.0, 4.0)[0] == "critical"  # 1.5 km/h at 2 m: drift by inversion
        assert rate_wind(30.0, 24.0) == ("critical", ("mucho viento",))  # gust 18 at 2 m: fine
        assert rate_wind(12.0, 40.0) == ("critical", ("ráfagas fuertes",))

    def test_matches_the_spray_verdicts_own_wind_rules(self):
        # 22 km/h at 10 m = 16.5 at 2 m: just above the green band (5–15), not red (> 20).
        assert rate_wind(22.0, None) == ("caution", ("mucho viento",))


class TestFetch:
    def test_request_asks_for_utc_hours_of_the_range(self, settings):
        settings.OPEN_METEO_API_KEY = ""

        url, params = history.build_request(CELL, date(2026, 11, 1), date(2026, 11, 3))

        assert url == URL
        assert params["start_date"] == "2026-11-01"
        assert params["end_date"] == "2026-11-03"
        assert params["timeformat"] == "unixtime"
        # Local days for start/end, so today's last hours come the same day; stamps stay UTC.
        assert params["timezone"] == "America/Argentina/Buenos_Aires"
        assert params["hourly"].split(",") == list(history.VARIABLES)
        assert "apikey" not in params

    def test_asks_for_the_spray_audit_variables_too(self, settings):
        settings.OPEN_METEO_API_KEY = ""

        _, params = history.build_request(CELL, date(2026, 11, 1), date(2026, 11, 1))

        assert params["hourly"].split(",") == [
            "temperature_2m",
            "relative_humidity_2m",
            "dew_point_2m",
            "precipitation",
            "wind_speed_10m",
            "wind_direction_10m",
            "wind_gusts_10m",
            "temperature_80m",
            "wet_bulb_temperature_2m",
            "cloud_cover",
            "surface_pressure",
            "shortwave_radiation",
        ]

    def test_the_commercial_key_goes_along_when_set(self, settings):
        settings.OPEN_METEO_API_KEY = "clave"

        _, params = history.build_request(CELL, date(2026, 11, 1), date(2026, 11, 1))

        assert params["apikey"] == "clave"

    @pytest.mark.django_db
    @time_machine.travel(NOW, tick=False)
    @respx.mock
    def test_stores_past_hours_in_our_own_table_and_revises_them_later(self):
        start = NOW - timedelta(hours=4)
        route = respx.get(URL).mock(return_value=httpx.Response(200, json=hourly_payload(start, 8)))
        with httpx.Client() as client:
            written = history.store_history(client, CELL, date(2026, 11, 16), date(2026, 11, 16))

        assert route.called
        assert written == 5  # 4 past hours and the current one; the future ones are dropped
        first = WeatherHour.objects.order_by("time").first()
        assert (first.time, first.wind_kmh, first.source) == (start, 12.0, history.SOURCE)

        route.mock(
            return_value=httpx.Response(
                200, json=hourly_payload(start, 8, wind_speed_10m=[30.0] * 8)
            )
        )
        with httpx.Client() as client:
            history.store_history(client, CELL, date(2026, 11, 16), date(2026, 11, 16))

        assert WeatherHour.objects.count() == 5
        assert set(WeatherHour.objects.values_list("wind_kmh", flat=True)) == {30.0}

    @pytest.mark.django_db
    @time_machine.travel(NOW, tick=False)
    @respx.mock
    def test_stores_the_audit_parameters_of_each_hour(self):
        respx.get(URL).mock(
            return_value=httpx.Response(200, json=hourly_payload(NOW - timedelta(hours=1), 1))
        )
        with httpx.Client() as client:
            history.store_history(client, CELL, date(2026, 11, 16), date(2026, 11, 16))

        row = WeatherHour.objects.get()
        assert (
            row.temperature_80m_c,
            row.wet_bulb_c,
            row.cloud_cover_pct,
            row.pressure_hpa,
            row.radiation_wm2,
        ) == (21.0, 15.5, 40.0, 1012.4, 520.0)

    def test_parses_unix_stamps_as_utc_hours(self):
        payload = hourly_payload(datetime(2026, 11, 16, 0, tzinfo=history.LOCAL), 1)
        payload["timezone"] = "America/Argentina/Buenos_Aires"
        payload["utc_offset_seconds"] = -10800

        (row,) = history.parse_hours(payload, until=NOW)

        assert row["time"] == datetime(2026, 11, 16, 3, tzinfo=UTC)
        assert row["time"].utcoffset() == timedelta(0)

    def test_skips_hours_with_no_data(self):
        payload = hourly_payload(NOW - timedelta(hours=2), 2)
        for series in payload["hourly"].values():
            if series is not payload["hourly"]["time"]:
                series[0] = None

        rows = history.parse_hours(payload, until=NOW)

        assert len(rows) == 1


@pytest.mark.django_db
class TestLoteHistoryApi:
    @pytest.fixture(autouse=True)
    def _frozen(self):
        with time_machine.travel(NOW, tick=False):
            yield

    def url(self, lote, **params):
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"/api/lotes/{lote.pk}/historico/" + (f"?{query}" if query else "")

    def test_days_and_hours_of_the_range_with_the_spray_wind_rating(self, user):
        lote = make_lote(user)
        day = datetime(2026, 11, 14, 3, tzinfo=UTC)  # 00:00 local
        store_hours(day, 24, temperature_c=18.0)
        WeatherHour.objects.filter(time=day + timedelta(hours=10)).update(
            temperature_c=31.0, rain_mm=4.5, wind_kmh=35.0, gust_kmh=52.0
        )

        response = client_for(user).get(self.url(lote, desde="2026-11-14", hasta="2026-11-14"))

        assert response.status_code == 200
        body = response.json()
        assert body["source"] == history.SOURCE
        assert "no medidos en el lote" in body["attribution"]
        assert body["complete"] is True
        assert body["days"] == [
            {
                "date": "2026-11-14",
                "temp_max_c": 31.0,
                "temp_min_c": 18.0,
                "rain_mm": 4.5,
                "wind_max_kmh": 35.0,
                "gust_max_kmh": 52.0,
                "humidity_min_pct": 60.0,
                "delta_t_max_c": None,
                "inversion_hours": None,
                "hours": 24,
            }
        ]
        assert len(body["hours"]) == 24
        assert body["hours"][0]["time"] == "2026-11-14T00:00:00-03:00"
        assert body["hours"][0]["spray_wind"] == "ok"
        windy = body["hours"][10]
        assert windy["spray_wind"] == "critical"
        assert windy["spray_wind_causes"] == ["mucho viento", "ráfagas fuertes"]

    def test_the_existing_hour_fields_keep_their_shape(self, user):
        lote = make_lote(user)
        store_hours(datetime(2026, 11, 14, 3, tzinfo=UTC), 1)

        body = client_for(user).get(self.url(lote, desde="2026-11-14", hasta="2026-11-14")).json()

        (hour,) = body["hours"]

        assert {k: hour[k] for k in list(hour)[:9]} == {
            "time": "2026-11-14T00:00:00-03:00",
            "temperature_c": 20.0,
            "humidity_pct": 60.0,
            "rain_mm": 0.0,
            "wind_kmh": 12.0,
            "wind_dir_deg": 90.0,
            "gust_kmh": 20.0,
            "spray_wind": "ok",
            "spray_wind_causes": [],
        }

    def test_hours_carry_the_audit_parameters_delta_t_and_inversion(self, user):
        lote = make_lote(user)
        day = datetime(2026, 11, 14, 3, tzinfo=UTC)  # 00:00 local
        store_hours(
            day,
            3,
            temperature_c=20.0,
            temperature_80m_c=22.0,
            wet_bulb_c=14.0,
            cloud_cover_pct=10.0,
            pressure_hpa=1010.2,
            radiation_wm2=0.0,
        )
        WeatherHour.objects.filter(time=day + timedelta(hours=1)).update(
            temperature_80m_c=18.0, wet_bulb_c=12.6, humidity_pct=45.0
        )
        WeatherHour.objects.filter(time=day + timedelta(hours=2)).update(
            temperature_80m_c=None, wet_bulb_c=None
        )

        body = client_for(user).get(self.url(lote, desde="2026-11-14", hasta="2026-11-14")).json()

        inverted, mixed, missing = body["hours"]
        assert {k: inverted[k] for k in AUDIT_KEYS} == {
            "temperature_80m_c": 22.0,
            "wet_bulb_c": 14.0,
            "cloud_cover_pct": 10.0,
            "pressure_hpa": 1010.2,
            "radiation_wm2": 0.0,
            "delta_t_c": 6.0,
            "inversion": True,
        }
        assert (mixed["delta_t_c"], mixed["inversion"]) == (7.4, False)
        assert (missing["delta_t_c"], missing["inversion"]) == (None, None)
        (summary,) = body["days"]
        assert (
            summary["humidity_min_pct"],
            summary["delta_t_max_c"],
            summary["inversion_hours"],
        ) == (45.0, 7.4, 1)

    def test_defaults_to_the_last_seven_days(self, user):
        lote = make_lote(user)

        body = client_for(user).get(self.url(lote)).json()

        assert (body["from"], body["to"]) == ("2026-11-10", "2026-11-16")
        assert len(body["days"]) == 7

    def test_says_when_the_data_is_still_loading(self, user):
        lote = make_lote(user)
        store_hours(datetime(2026, 11, 15, 3, tzinfo=UTC), 10)

        body = client_for(user).get(self.url(lote, desde="2026-11-15", hasta="2026-11-16")).json()

        assert body["complete"] is False
        assert body["days"][1] == {
            "date": "2026-11-16",
            "temp_max_c": None,
            "temp_min_c": None,
            "rain_mm": None,
            "wind_max_kmh": None,
            "gust_max_kmh": None,
            "humidity_min_pct": None,
            "delta_t_max_c": None,
            "inversion_hours": None,
            "hours": 0,
        }

    @pytest.mark.parametrize(
        ("params", "message"),
        [
            ({"hasta": "2026-11-17"}, "La fecha «hasta» no puede ser posterior a hoy."),
            (
                {"desde": "2026-11-10", "hasta": "2026-11-01"},
                "La fecha «desde» tiene que ser anterior a «hasta».",
            ),
            ({"desde": "2026-09-01", "hasta": "2026-11-01"}, "Elegí hasta 31 días."),
            (
                {"desde": "2020-12-30", "hasta": "2021-01-02"},
                "El historial empieza el 1 de enero de 2021.",
            ),
            ({"desde": "16/11/2026"}, "Usá fechas con el formato AAAA-MM-DD."),
        ],
    )
    def test_validates_the_range_in_spanish(self, user, params, message):
        response = client_for(user).get(self.url(make_lote(user), **params))

        assert response.status_code == 400
        assert response.json() == {"detail": message}

    def test_another_users_lote_is_404(self, user, make_user):
        theirs = make_lote(make_user(email="beto@example.com"))

        assert client_for(user).get(self.url(theirs)).status_code == 404

    def test_never_calls_the_provider(self, user):
        with respx.mock(assert_all_called=False) as mock:
            client_for(user).get(self.url(make_lote(user)))

        assert not mock.calls


@pytest.mark.django_db
class TestHistoryTasks:
    @pytest.fixture(autouse=True)
    def _frozen(self):
        # Not @respx.mock on the class: it turns the class into a function pytest never collects.
        with time_machine.travel(NOW, tick=False), respx.mock:
            yield

    def test_runs_every_hour_at_minute_twenty(self, settings):
        schedule = settings.CELERY_BEAT_SCHEDULE["archive-history"]

        assert schedule["task"] == "archiver.fetch_history"
        assert schedule["schedule"] == crontab(minute=20)

    def test_an_empty_cell_gets_ninety_days_in_chunks_of_at_most_max_days(self, user):
        make_lote(user)
        make_lote(user, name="Vecino")  # same cell: one set of requests
        route = respx.get(URL).mock(side_effect=two_hours_of_the_first_day)

        stats = tasks.fetch_history()

        assert requested_ranges(route) == [
            ("2026-08-18", "2026-09-17"),
            ("2026-09-18", "2026-10-18"),
            ("2026-10-19", "2026-11-16"),
        ]
        assert stats == {"stored": 6, "failed": 0, "cells": 1}
        assert WeatherHour.objects.filter(cell_lat=CELL[0], cell_lon=CELL[1]).count() == 6

    def test_a_cell_with_a_gap_catches_up_from_its_last_hour(self, user):
        make_lote(user)
        store_hours(datetime(2026, 11, 10, 3, tzinfo=UTC), 24)  # last: 23:00 local of the 10th
        route = respx.get(URL).mock(side_effect=two_hours_of_the_first_day)

        stats = tasks.fetch_history()

        assert requested_ranges(route) == [("2026-11-09", "2026-11-16")]
        assert stats == {"stored": 2, "failed": 0, "cells": 1}
        assert WeatherHour.objects.count() == 24 + 2  # plus 00:00 and 01:00 of the 9th

    def test_an_up_to_date_cell_asks_only_for_yesterday_and_today(self, user):
        make_lote(user)
        store_hours(datetime(2026, 11, 15, 3, tzinfo=UTC), 33)  # through 08:00 local today
        route = respx.get(URL).mock(
            return_value=httpx.Response(200, json=hourly_payload(NOW - timedelta(hours=3), 4))
        )

        stats = tasks.fetch_history()

        assert requested_ranges(route) == [("2026-11-15", "2026-11-16")]
        assert stats == {"stored": 4, "failed": 0, "cells": 1}
        latest = WeatherHour.objects.latest("time")
        assert latest.time == NOW  # today's hours appear the same day

    def test_the_run_at_four_twenty_also_revises_the_last_three_days(self, user):
        make_lote(user)
        revision = datetime(2026, 11, 16, 7, 20, tzinfo=UTC)  # 04:20 local
        store_hours(datetime(2026, 11, 15, 3, tzinfo=UTC), 28)  # through 03:00 local today
        route = respx.get(URL).mock(side_effect=two_hours_of_the_first_day)

        with time_machine.travel(revision, tick=False):
            stats = tasks.fetch_history()
        with time_machine.travel(revision + timedelta(hours=1), tick=False):
            tasks.fetch_history()

        assert requested_ranges(route) == [
            ("2026-11-13", "2026-11-16"),
            ("2026-11-15", "2026-11-16"),
        ]
        assert stats == {"stored": 2, "failed": 0, "cells": 1}

    def test_a_failing_cell_does_not_stop_the_others(self, user):
        make_lote(user)  # empty cell: three chunks, the first fails
        make_lote(user, name="Lejos", latitude=Decimal("-34.5"), longitude=Decimal("-60.0"))

        def by_cell(request):
            if request.url.params["latitude"] == "-33.0":
                return httpx.Response(503)
            return two_hours_of_the_first_day(request)

        route = respx.get(URL).mock(side_effect=by_cell)

        stats = tasks.fetch_history()

        failing = [r for r in route.calls if r.request.url.params["latitude"] == "-33.0"]
        assert len(failing) == 1  # its later chunks wait: no hole behind the last stored hour
        assert stats == {"stored": 6, "failed": 1, "cells": 2}
        assert not WeatherHour.objects.filter(cell_lat=CELL[0]).exists()
        assert WeatherHour.objects.filter(cell_lat=Decimal("-34.5")).count() == 6

    def test_a_provider_error_is_counted_and_the_run_goes_on(self, user):
        make_lote(user)
        respx.get(URL).mock(return_value=httpx.Response(503))

        assert tasks.fetch_history() == {"stored": 0, "failed": 1, "cells": 1}

    def test_backfill_loads_ninety_days_once_per_cell(self):
        route = respx.get(URL).mock(side_effect=two_hours_of_the_first_day)

        tasks.backfill_history("-33.04", "-61.06")
        again = tasks.backfill_history("-33.04", "-61.06")

        assert route.call_count == 1
        params = route.calls[0].request.url.params
        assert (params["start_date"], params["end_date"]) == ("2026-08-18", "2026-11-16")
        assert again == 0

    def test_creating_a_lote_queues_its_backfill(
        self, user, settings, django_capture_on_commit_callbacks
    ):
        settings.HISTORY_BACKFILL_ON_CREATE = True
        route = respx.get(URL).mock(
            return_value=httpx.Response(200, json=hourly_payload(NOW - timedelta(days=89), 3))
        )

        with django_capture_on_commit_callbacks(execute=True):
            response = client_for(user).post(
                "/api/lotes/", {"name": "N", "latitude": -33.04, "longitude": -61.06}, format="json"
            )

        assert response.status_code == 201
        assert route.call_count == 1
        assert WeatherHour.objects.count() == 3

    def test_a_queue_outage_does_not_fail_saving_the_lote(
        self, user, settings, monkeypatch, django_capture_on_commit_callbacks
    ):
        from kombu.exceptions import OperationalError

        settings.HISTORY_BACKFILL_ON_CREATE = True

        def broker_down(*args, **kwargs):
            raise OperationalError("Connection refused")

        monkeypatch.setattr(tasks.backfill_history, "delay", broker_down)

        with django_capture_on_commit_callbacks(execute=True):
            response = client_for(user).post(
                "/api/lotes/", {"name": "N", "latitude": -33.04, "longitude": -61.06}, format="json"
            )

        assert response.status_code == 201
