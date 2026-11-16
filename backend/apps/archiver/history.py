"""Past weather per grid cell: fetched from Open-Meteo, stored as WeatherHour, read per lote.

Source: the Historical Forecast API (S11). It stitches the first hours of every model run, so
it tracks what actually happened from 2021 on; ERA5 is coarser and meant for climate series.
Account endpoints never call it: they read only what the tasks stored (Doc/arquitectura.md).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
from django.conf import settings
from django.utils import timezone

from engine import rate_wind

from .cells import Cell
from .models import WeatherHour

SOURCE = "open-meteo/historical-forecast"
ATTRIBUTION = "Datos de modelo de Open-Meteo (CC BY 4.0), no medidos en el lote."
LOCAL = ZoneInfo("America/Argentina/Buenos_Aires")
FIRST_DAY = date(2021, 1, 1)
MAX_DAYS = 31
BACKFILL_DAYS = 90
REFRESH_DAYS = 3

# Open-Meteo variable → WeatherHour field
VARIABLES = {
    "temperature_2m": "temperature_c",
    "relative_humidity_2m": "humidity_pct",
    "dew_point_2m": "dew_point_c",
    "precipitation": "rain_mm",
    "wind_speed_10m": "wind_kmh",
    "wind_direction_10m": "wind_dir_deg",
    "wind_gusts_10m": "gust_kmh",
}
VALUE_FIELDS = tuple(VARIABLES.values())


def build_request(cell: Cell, start: date, end: date) -> tuple[str, dict[str, str]]:
    params = {
        "latitude": str(cell[0]),
        "longitude": str(cell[1]),
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "hourly": ",".join(VARIABLES),
        "timeformat": "unixtime",  # UTC seconds: no daylight-saving or offset guessing
        "wind_speed_unit": "kmh",
    }
    if settings.OPEN_METEO_API_KEY:
        params["apikey"] = settings.OPEN_METEO_API_KEY
    return settings.OPEN_METEO_HISTORICAL_URL, params


def parse_hours(payload: dict, until: datetime) -> list[dict]:
    """Rows for WeatherHour from an hourly payload, without hours after `until` or with no data."""
    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    rows = []
    for index, stamp in enumerate(times):
        moment = datetime.fromtimestamp(stamp, tz=UTC)
        if moment > until:
            continue
        values = {}
        for variable, field in VARIABLES.items():
            series = hourly.get(variable) or []
            values[field] = series[index] if index < len(series) else None
        if all(value is None for value in values.values()):
            continue
        rows.append({"time": moment, **values})
    return rows


def store_history(client: httpx.Client, cell: Cell, start: date, end: date) -> int:
    """Fetch and upsert one cell's hours between two local dates. Returns the rows written."""
    url, params = build_request(cell, start, end)
    response = client.get(url, params=params)
    response.raise_for_status()
    now = timezone.now()
    rows = parse_hours(response.json(), until=now)
    objects = [
        WeatherHour(cell_lat=cell[0], cell_lon=cell[1], source=SOURCE, fetched_at=now, **row)
        for row in rows
    ]
    # A later run revises recent hours: the provider fills them in as runs arrive.
    WeatherHour.objects.bulk_create(
        objects,
        update_conflicts=True,
        unique_fields=["cell_lat", "cell_lon", "source", "time"],
        update_fields=[*VALUE_FIELDS, "fetched_at"],
    )
    return len(objects)


def backfill_range(today: date) -> tuple[date, date]:
    return max(today - timedelta(days=BACKFILL_DAYS), FIRST_DAY), today


def refresh_range(today: date) -> tuple[date, date]:
    return today - timedelta(days=REFRESH_DAYS), today


# --- Reading, for the lote screens ---


class RangeError(ValueError):
    """A history request the API refuses; the message is for the user."""


def parse_range(raw_from: str | None, raw_to: str | None, today: date) -> tuple[date, date]:
    """Validate ?desde=&hasta= (YYYY-MM-DD). Default: the last 7 days."""
    try:
        end = date.fromisoformat(raw_to) if raw_to else today
        start = date.fromisoformat(raw_from) if raw_from else end - timedelta(days=6)
    except ValueError as exc:
        raise RangeError("Usá fechas con el formato AAAA-MM-DD.") from exc
    if end > today:
        raise RangeError("La fecha «hasta» no puede ser posterior a hoy.")
    if start > end:
        raise RangeError("La fecha «desde» tiene que ser anterior a «hasta».")
    if start < FIRST_DAY:
        raise RangeError("El historial empieza el 1 de enero de 2021.")
    if (end - start).days + 1 > MAX_DAYS:
        raise RangeError(f"Elegí hasta {MAX_DAYS} días.")
    return start, end


@dataclass(frozen=True)
class DaySummary:
    date: date
    temp_max_c: float | None
    temp_min_c: float | None
    rain_mm: float | None
    wind_max_kmh: float | None
    gust_max_kmh: float | None
    hours: int


def _max(values):
    values = [v for v in values if v is not None]
    return round(max(values), 1) if values else None


def _min(values):
    values = [v for v in values if v is not None]
    return round(min(values), 1) if values else None


def _sum(values):
    values = [v for v in values if v is not None]
    return round(sum(values), 1) if values else None


def lote_history(cell: Cell, start: date, end: date, today: date) -> dict:
    """Hours and daily summaries of one cell between two local dates, from our own table.

    `complete` is false while any past day of the range lacks some of its 24 hours (the data
    is still loading, or the provider had a gap); today is partial by nature.
    """
    first = datetime.combine(start, datetime.min.time(), tzinfo=LOCAL)
    last = datetime.combine(end + timedelta(days=1), datetime.min.time(), tzinfo=LOCAL)
    rows = list(
        WeatherHour.objects.filter(
            cell_lat=cell[0], cell_lon=cell[1], source=SOURCE, time__gte=first, time__lt=last
        ).order_by("time")
    )
    hours = []
    by_day: dict[date, list[WeatherHour]] = {}
    for row in rows:
        local = row.time.astimezone(LOCAL)
        by_day.setdefault(local.date(), []).append(row)
        level, causes = (
            rate_wind(row.wind_kmh, row.gust_kmh) if row.wind_kmh is not None else (None, ())
        )
        hours.append(
            {
                "time": local.isoformat(),
                "temperature_c": row.temperature_c,
                "humidity_pct": row.humidity_pct,
                "rain_mm": row.rain_mm,
                "wind_kmh": row.wind_kmh,
                "wind_dir_deg": row.wind_dir_deg,
                "gust_kmh": row.gust_kmh,
                "spray_wind": level,
                "spray_wind_causes": list(causes),
            }
        )
    days = []
    day = start
    while day <= end:
        rows_of_day = by_day.get(day, [])
        days.append(
            vars(
                DaySummary(
                    date=day,
                    temp_max_c=_max(r.temperature_c for r in rows_of_day),
                    temp_min_c=_min(r.temperature_c for r in rows_of_day),
                    rain_mm=_sum(r.rain_mm for r in rows_of_day),
                    wind_max_kmh=_max(r.wind_kmh for r in rows_of_day),
                    gust_max_kmh=_max(r.gust_kmh for r in rows_of_day),
                    hours=len(rows_of_day),
                )
            )
        )
        day += timedelta(days=1)
    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "source": SOURCE,
        "attribution": ATTRIBUTION,
        "complete": bool(rows) and all(d["hours"] >= 24 for d in days if d["date"] < today),
        "days": [{**d, "date": d["date"].isoformat()} for d in days],
        "hours": hours,
    }
