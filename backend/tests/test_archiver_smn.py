from datetime import datetime
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
import pytest
import respx
import time_machine
from celery.schedules import crontab

from apps.archiver.models import Observation
from apps.archiver.smn import parse_datohorario
from apps.archiver.tasks import fetch_smn_observations

ART = ZoneInfo("America/Argentina/Buenos_Aires")
FIXTURE = Path(__file__).parent / "fixtures" / "datohorario20261102.txt"
SMN = "https://ssl.smn.gob.ar/dpd/descarga_opendata.php"
# 2026-11-03 03:00 local, when beat runs the task.
RUN_AT = datetime(2026, 11, 3, 3, 0, tzinfo=ART)


def fixture_text() -> str:
    return FIXTURE.read_bytes().decode("latin-1")


class TestParser:
    def test_parses_rows_and_skips_headers_and_wrapped_names(self):
        rows = parse_datohorario(fixture_text())

        assert len(rows) == 10
        assert {r.station_name for r in rows} == {
            "AEROPARQUE AERO",
            "BARILOCHE AERO",
            "ESCUELA DE AVIACION MILITA",
            "MARCOS JUAREZ AERO",
            "ROSARIO AERO",
            "VENADO TUERTO AERO",
        }

    def test_values_and_local_time(self):
        rosario = [r for r in parse_datohorario(fixture_text()) if r.station_name == "ROSARIO AERO"]

        last = rosario[-1]
        assert last.observed_at == datetime(2026, 11, 2, 23, 0, tzinfo=ART)
        assert last.temperature_c == Decimal("20.6")
        assert last.humidity_pct == 76
        assert last.pressure_hpa == Decimal("1012.9")
        assert last.wind_direction_deg == 0
        assert last.wind_speed_kmh == Decimal("0")
        assert last.raw_line.startswith("02112026    23  20.6")

    def test_empty_columns_are_none_and_leading_dot_parses(self):
        bariloche = next(
            r for r in parse_datohorario(fixture_text()) if r.station_name == "BARILOCHE AERO"
        )

        assert bariloche.pressure_hpa is None
        assert bariloche.temperature_c == Decimal("0.4")

    def test_negative_temperature(self):
        line = "15062026     6  -3.2   95  1020.1    0    0     MARCOS JUAREZ AERO"

        (row,) = parse_datohorario(line)

        assert row.temperature_c == Decimal("-3.2")

    def test_missing_file_message_has_no_rows(self):
        assert parse_datohorario("observaciones/datohorario20261102.txtEl archivo no existe.") == []


def test_runs_every_hour_so_a_missed_run_is_caught_by_the_next(settings):
    schedule = settings.CELERY_BEAT_SCHEDULE["archive-smn-observations"]

    assert schedule["task"] == "archiver.fetch_smn_observations"
    assert schedule["schedule"] == crontab(minute=10)


@pytest.mark.django_db
class TestTask:
    @time_machine.travel(RUN_AT, tick=False)
    def test_stores_only_the_three_stations_and_is_idempotent(self, settings):
        settings.SMN_LOOKBACK_DAYS = 1
        with respx.mock() as mock:
            route = mock.get(SMN).mock(
                return_value=httpx.Response(200, content=FIXTURE.read_bytes())
            )

            first = fetch_smn_observations()
            second = fetch_smn_observations()

        assert route.calls[0].request.url.params["file"] == "observaciones/datohorario20261102.txt"
        assert first == {"stored": 7, "failed_days": 0}
        assert second == {"stored": 0, "failed_days": 0}
        assert Observation.objects.count() == 7
        assert dict(Observation.objects.values_list("station_name", "station_id").distinct()) == {
            "ROSARIO AERO": "87480",
            "VENADO TUERTO AERO": "87468",
            "MARCOS JUAREZ AERO": "87467",
        }
        venado = Observation.objects.get(
            station_id="87468", observed_at=datetime(2026, 11, 2, 6, tzinfo=ART)
        )
        assert venado.temperature_c == Decimal("13.3")
        assert venado.humidity_pct == 100
        assert venado.pressure_hpa == Decimal("1011.3")
        assert venado.wind_direction_deg == 180
        assert venado.wind_speed_kmh == Decimal("7")
        assert "VENADO TUERTO AERO" in venado.raw_line

    @time_machine.travel(RUN_AT, tick=False)
    def test_reads_the_lookback_days_yesterday_first(self, settings):
        settings.SMN_LOOKBACK_DAYS = 3
        with respx.mock() as mock:
            route = mock.get(SMN).mock(
                return_value=httpx.Response(200, content=FIXTURE.read_bytes())
            )

            stats = fetch_smn_observations()

        files = [c.request.url.params["file"] for c in route.calls]
        assert files == [
            "observaciones/datohorario20261102.txt",
            "observaciones/datohorario20261101.txt",
            "observaciones/datohorario20261031.txt",
        ]
        assert stats == {"stored": 7, "failed_days": 0}

    @time_machine.travel(RUN_AT, tick=False)
    @pytest.mark.parametrize(
        "response",
        [
            httpx.ConnectError("down"),
            httpx.Response(503),
            httpx.Response(
                200, content=b"observaciones/datohorario20261102.txtEl archivo no existe."
            ),
        ],
        ids=["connect", "503", "missing-file"],
    )
    def test_failures_log_and_do_not_raise(self, settings, response, caplog):
        settings.SMN_LOOKBACK_DAYS = 1
        with respx.mock() as mock:
            if isinstance(response, Exception):
                mock.get(SMN).mock(side_effect=response)
            else:
                mock.get(SMN).mock(return_value=response)

            stats = fetch_smn_observations()

        assert stats == {"stored": 0, "failed_days": 1}
        assert Observation.objects.count() == 0
        assert "SMN datohorario 2026-11-02" in caplog.text
