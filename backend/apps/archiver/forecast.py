"""Forecast for a grid cell, read from the archive (S5): values and decisions.

Deterministic models give the values (the median across models) and feed the
engine; ensembles give rain probabilities. The API never calls Open-Meteo.
"""

import math
from collections.abc import Iterable
from dataclasses import dataclass, field, fields, replace
from datetime import date, datetime, timedelta
from statistics import mean, median
from typing import NamedTuple
from zoneinfo import ZoneInfo

from django.db.models import JSONField, Q
from django.db.models.expressions import RawSQL
from django.utils import timezone

import engine
from engine import DayRain, Hour

from .cells import Cell
from .models import ForecastSnapshot
from .openmeteo import DETERMINISTIC_MODELS, ENSEMBLE_MODELS, TIMEZONE
from .summary import tonight_window

TZ = ZoneInfo(TIMEZONE)
HOUR = timedelta(hours=1)
DAILY_DAYS = 7
HOURLY_HOURS = 48
PAST_RAIN_DAYS = 7
# Order of preference for the rain that has fallen and for sunrise/sunset.
# ECMWF first: generally the best-scoring global model (sin confirmar en la zona).
PREFERRED_MODELS = DETERMINISTIC_MODELS

# Payload variable for each Hour field.
VARIABLES = {
    "temperature_c": "temperature_2m",
    "humidity_pct": "relative_humidity_2m",
    "dew_point_c": "dew_point_2m",
    "wet_bulb_c": "wet_bulb_temperature_2m",
    "wind_kmh": "wind_speed_10m",
    "wind_dir_deg": "wind_direction_10m",
    "gust_kmh": "wind_gusts_10m",
    "cloud_cover_pct": "cloud_cover",
    "cloud_cover_low_pct": "cloud_cover_low",
    "precipitation_mm": "precipitation",
    "temperature_80m_c": "temperature_80m",
    "weather_code": "weather_code",
}

# Only the time and precipitation keys of an ensemble (members multiply its size ~50x).
ENSEMBLE_RAIN_SQL = """(
    SELECT jsonb_object_agg(e.key, e.value)
    FROM jsonb_each("archiver_forecastsnapshot"."payload" -> 'hourly') AS e
    WHERE e.key IN ('time', 'precipitation') OR e.key LIKE %s
)"""


@dataclass
class CellArchive:
    fetched_at: datetime
    deterministic: dict[str, dict] = field(default_factory=dict)  # model -> payload
    ensemble: dict[str, dict] = field(default_factory=dict)  # model -> hourly rain keys


def latest_archives(cells: Iterable[Cell]) -> dict[Cell, CellArchive]:
    """Latest snapshot of each model for every cell, in two queries."""
    cells = set(cells)
    if not cells:
        return {}
    cell_filter = Q()
    for lat, lon in cells:
        cell_filter |= Q(cell_lat=lat, cell_lon=lon)
    base = (
        ForecastSnapshot.objects.filter(cell_filter)
        .order_by("cell_lat", "cell_lon", "model", "-fetched_at")
        .distinct("cell_lat", "cell_lon", "model")
    )

    archives: dict[Cell, CellArchive] = {}
    deterministic = base.filter(
        kind=ForecastSnapshot.Kind.DETERMINISTIC, model__in=DETERMINISTIC_MODELS
    ).values("cell_lat", "cell_lon", "model", "fetched_at", "payload")
    for row in deterministic:
        cell = (row["cell_lat"], row["cell_lon"])
        archive = archives.setdefault(cell, CellArchive(fetched_at=row["fetched_at"]))
        archive.deterministic[row["model"]] = row["payload"]
        archive.fetched_at = max(archive.fetched_at, row["fetched_at"])
    if not archives:
        return {}

    ensemble = (
        base.filter(kind=ForecastSnapshot.Kind.ENSEMBLE, model__in=ENSEMBLE_MODELS)
        .annotate(rain=RawSQL(ENSEMBLE_RAIN_SQL, ("precipitation\\_member%",), JSONField()))
        .values("cell_lat", "cell_lon", "model", "rain")
    )
    for row in ensemble:
        cell = (row["cell_lat"], row["cell_lon"])
        if cell in archives and row["rain"]:
            archives[cell].ensemble[row["model"]] = row["rain"]
    return archives


# --- Normalization ---------------------------------------------------------------


def _local(stamp: str) -> datetime:
    return datetime.fromisoformat(stamp).replace(tzinfo=TZ)


def _iso(moment: datetime | None) -> str | None:
    return moment.astimezone(TZ).isoformat() if moment else None


def _column(hourly: dict, name: str, length: int) -> list:
    values = list(hourly.get(name) or [])
    return (values + [None] * length)[:length]


def hours_from_payload(payload: dict) -> list[Hour]:
    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    columns = {attr: _column(hourly, name, len(times)) for attr, name in VARIABLES.items()}
    return [
        Hour(time=_local(stamp), **{attr: columns[attr][i] for attr in VARIABLES})
        for i, stamp in enumerate(times)
    ]


def _median(values: Iterable) -> float | None:
    present = [v for v in values if v is not None]
    return median(present) if present else None


def _circular_mean(degrees: Iterable) -> float | None:
    present = [math.radians(d) for d in degrees if d is not None]
    if not present:
        return None
    angle = math.degrees(math.atan2(sum(map(math.sin, present)), sum(map(math.cos, present))))
    return round(angle) % 360


def consensus(models: dict[str, list[Hour]]) -> list[Hour]:
    """One series with the median of each variable across models, hour by hour.

    The 80 m temperature is rebuilt as consensus T2 plus the median (T80 − T2)
    of the models that have it, so the inversion signal compares like with like.
    """
    by_time: dict[datetime, list[Hour]] = {}
    for hours in models.values():
        for hour in hours:
            by_time.setdefault(hour.time, []).append(hour)
    numeric = [f.name for f in fields(Hour) if f.name not in {"time", "wind_dir_deg"}]
    series = []
    for time in sorted(by_time):
        group = by_time[time]
        values = {name: _median(getattr(h, name) for h in group) for name in numeric}
        lapse = _median(
            h.temperature_80m_c - h.temperature_c
            for h in group
            if h.temperature_80m_c is not None and h.temperature_c is not None
        )
        t2 = values["temperature_c"]
        values["temperature_80m_c"] = t2 + lapse if t2 is not None and lapse is not None else None
        values["weather_code"] = None  # categorical: read per model where needed
        values["wind_dir_deg"] = _circular_mean(h.wind_dir_deg for h in group)
        series.append(Hour(time=time, **values))
    return series


# --- Probabilities (S4) ------------------------------------------------------------


def _probabilities(ensembles: dict[str, dict], bucket) -> dict:
    """Mean, with equal weights per ensemble, of the fraction of wet members per bucket."""
    fractions: dict = {}
    for rain in ensembles.values():
        times = [_local(t) for t in rain.get("time") or []]
        members = [v for k, v in rain.items() if k.startswith("precipitation")]
        totals: dict = {}
        for values in members:
            sums: dict = {}
            for time, value in zip(times, values or [], strict=False):
                key = bucket(time)
                if value is not None and key is not None:  # None: outside every bucket
                    sums[key] = sums.get(key, 0.0) + value
            for key, total in sums.items():
                wet, count = totals.get(key, (0, 0))
                totals[key] = (wet + (total >= engine.DEFAULT.rain_probability_mm), count + 1)
        for key, (wet, count) in totals.items():
            fractions.setdefault(key, []).append(wet / count)
    return {key: round(100 * mean(values)) for key, values in fractions.items()}


# --- Assembly ----------------------------------------------------------------------


def _round(value: float | None, digits: int = 1):
    if value is None:
        return None
    return round(value) if digits == 0 else round(value, digits)


def _sun_times(payloads: dict[str, dict], day: date) -> tuple[datetime | None, datetime | None]:
    for model in PREFERRED_MODELS:
        daily = (payloads.get(model) or {}).get("daily") or {}
        days = daily.get("time") or []
        if day.isoformat() in days:
            index = days.index(day.isoformat())
            sunrise = _column(daily, "sunrise", len(days))[index]
            sunset = _column(daily, "sunset", len(days))[index]
            if sunrise and sunset:
                return _local(sunrise), _local(sunset)
    return None, None


def _rain_past(models: dict[str, list[Hour]], now_hour: datetime) -> float | None:
    """Sum over the last 7 days of the first preferred model that covers them."""
    start = now_hour - timedelta(days=PAST_RAIN_DAYS)
    for model in PREFERRED_MODELS:
        hours = models.get(model) or []
        if not hours or hours[0].time > start + HOUR:
            continue
        values = [
            h.precipitation_mm
            for h in hours
            if start < h.time <= now_hour and h.precipitation_mm is not None
        ]
        if values:
            return round(sum(values), 1)
    return None


def _rain_after(models: dict[str, list[Hour]], now_hour: datetime) -> float | None:
    """Median across models of the rain still to fall today (stamps after the current hour)."""
    totals = []
    for hours in models.values():
        rest = [
            h.precipitation_mm
            for h in hours
            if h.time.date() == now_hour.date()
            and h.time > now_hour
            and h.precipitation_mm is not None
        ]
        if rest:
            totals.append(sum(rest))
    return _round(_median(totals))


def _day(models: dict[str, list[Hour]], day: date, probability) -> dict:
    first, last = engine.config.SKY_DAY_HOURS
    maxima, minima, rains, clouds, thunders = [], [], [], [], []
    for hours in models.values():
        today = [h for h in hours if h.time.date() == day]
        temps = [h.temperature_c for h in today if h.temperature_c is not None]
        if not temps:
            continue
        maxima.append(max(temps))
        minima.append(min(temps))
        rain = [h.precipitation_mm for h in today if h.precipitation_mm is not None]
        rains.append(sum(rain) if rain else None)
        daytime = [
            h.cloud_cover_pct
            for h in today
            if first <= h.time.hour <= last and h.cloud_cover_pct is not None
        ]
        clouds.append(mean(daytime) if daytime else None)
        thunders.append(any(h.weather_code in engine.config.THUNDER_WEATHER_CODES for h in today))
    rain_mm = _round(_median(rains))
    return {
        "date": day.isoformat(),
        "max_c": _round(_median(maxima)),
        "min_c": _round(_median(minima)),
        "rain_mm": rain_mm,
        "rain_probability_pct": probability,
        "sky": engine.sky(rain_mm, _median(clouds), sum(thunders) * 2 > len(thunders)),
    }


HOUR_SKY = replace(engine.config.DEFAULT, sky_rain_mm=engine.config.SKY_RAIN_HOUR_MM)


def _hour_skies(models: dict[str, list[Hour]], series: list[Hour]) -> dict[datetime, str]:
    """The sky of each consensus hour: thunder when most models carry it that hour."""
    thunder: dict[datetime, list[bool]] = {}
    for hours in models.values():
        for hour in hours:
            thunder.setdefault(hour.time, []).append(
                hour.weather_code in engine.config.THUNDER_WEATHER_CODES
            )
    return {
        h.time: engine.sky(
            h.precipitation_mm,
            h.cloud_cover_pct,
            sum(thunder.get(h.time, [])) * 2 > len(thunder.get(h.time, [])),
            HOUR_SKY,
        )
        for h in series
    }


class Forecast(NamedTuple):
    payload: dict  # the S5 body
    headline: engine.Headline  # the most urgent decision, for the lote card


def build_forecast(archive: CellArchive, now: datetime) -> Forecast:
    now_local = timezone.localtime(now, TZ)
    now_hour = now_local.replace(minute=0, second=0, microsecond=0)
    today = now_local.date()
    models = {
        model: hours_from_payload(archive.deterministic[model])
        for model in DETERMINISTIC_MODELS
        if model in archive.deterministic
    }
    series = consensus(models)
    by_time = {h.time: h for h in series}
    daily_probability = (
        _probabilities(archive.ensemble, lambda t: t.date()) if archive.ensemble else {}
    )
    hourly_probability = _probabilities(archive.ensemble, lambda t: t) if archive.ensemble else {}

    current = by_time.get(now_hour) or Hour(time=now_hour)
    hour_sky = _hour_skies(models, series)
    days = [today + timedelta(days=i) for i in range(DAILY_DAYS)]
    daily = [_day(models, d, daily_probability.get(d)) for d in days]
    sunrise, sunset = _sun_times(archive.deterministic, today)
    upcoming = [h for h in series if h.time >= now_hour][:HOURLY_HOURS]

    start, end = tonight_window(now_local.replace(tzinfo=None))
    frost = engine.frost_tonight(models, start.replace(tzinfo=TZ), end.replace(tzinfo=TZ))
    spray = engine.spray_today(series, now_local, sunrise, sunset)
    # Field work looks ahead: for today only the rain still to fall counts.
    rest_probability = (
        _probabilities(
            archive.ensemble, lambda t: "rest" if t.date() == today and t > now_hour else None
        ).get("rest")
        if archive.ensemble
        else None
    )
    field_rain = [
        DayRain(date=today, mm=_rain_after(models, now_hour), probability_pct=rest_probability)
    ]
    field_rain += [
        DayRain(date=d, mm=day["rain_mm"], probability_pct=day["rain_probability_pct"])
        for d, day in zip(days[1:], daily[1:], strict=True)
    ]
    field_verdict = engine.field_work(field_rain, today)

    payload = {
        "fetched_at": _iso(archive.fetched_at),
        "models": list(models),
        "now": {
            "time": _iso(now_hour),
            "temperature_c": _round(current.temperature_c),
            "humidity_pct": _round(current.humidity_pct, 0),
            "wind_kmh": _round(current.wind_kmh),
            "wind_dir_deg": current.wind_dir_deg,
            "gust_kmh": _round(current.gust_kmh),
            "sky": hour_sky.get(now_hour) or engine.sky(None, None, thunder=False, cfg=HOUR_SKY),
            "cloud_cover_pct": _round(current.cloud_cover_pct),
            "rain_mm": _round(current.precipitation_mm),
        },
        "today": {
            "max_c": daily[0]["max_c"],
            "min_c": daily[0]["min_c"],
            "sunrise": _iso(sunrise),
            "sunset": _iso(sunset),
        },
        "rain_past_7d_mm": _rain_past(models, now_hour),
        "daily": daily,
        "hourly": [
            {
                "time": _iso(h.time),
                "temperature_c": _round(h.temperature_c),
                "humidity_pct": _round(h.humidity_pct, 0),
                "wind_kmh": _round(h.wind_kmh),
                "gust_kmh": _round(h.gust_kmh),
                "rain_mm": _round(h.precipitation_mm),
                "rain_probability_pct": hourly_probability.get(h.time),
                "sky": hour_sky[h.time],
                "cloud_cover_pct": _round(h.cloud_cover_pct),
            }
            for h in upcoming
        ],
        "decisions": {
            "frost_tonight": {
                "level": frost.level,
                "min_2m_c": frost.min_2m_c,
                "ground_estimate_c": frost.ground_estimate_c,
                "models_agreeing": frost.models_agreeing,
                "reason": frost.reason,
            },
            "spray_today": {
                "level": spray.level,
                "best_window": (
                    {"start": _iso(spray.best_window[0]), "end": _iso(spray.best_window[1])}
                    if spray.best_window
                    else None
                ),
                "reason": spray.reason,
            },
            "field_work": {
                "level": field_verdict.level,
                "next_rain": (
                    {
                        "date": field_verdict.next_rain.date.isoformat(),
                        "mm": field_verdict.next_rain.mm,
                        "probability_pct": field_verdict.next_rain.probability_pct,
                    }
                    if field_verdict.next_rain
                    else None
                ),
                "reason": field_verdict.reason,
            },
            "engine_version": engine.ENGINE_VERSION,
            "validated": False,
        },
    }
    return Forecast(payload, engine.headline(frost, spray, field_verdict))


def forecasts(cells: Iterable[Cell], now: datetime | None = None) -> dict[Cell, Forecast]:
    """Forecast per cell that has archived deterministic forecasts (others are absent)."""
    now = now or timezone.now()
    return {cell: build_forecast(archive, now) for cell, archive in latest_archives(cells).items()}
