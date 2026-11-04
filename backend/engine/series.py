"""Normalized inputs and outputs of the engine, plus small physics helpers.

The engine never reads provider payloads: the caller turns them into `Hour`
series (one per model, or a consensus series) with timezone-aware times.
"""

import math
from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal

from .config import WIND_2M_FACTOR

Level = Literal["ok", "caution", "critical"]
Sky = Literal["sol", "parcial", "nublado", "lluvia", "tormenta"]

SEVERITY: dict[str, int] = {"ok": 0, "caution": 1, "critical": 2}


@dataclass(frozen=True, slots=True)
class Hour:
    """One forecast hour. Wind and gusts are at 10 m, as the models give them."""

    time: datetime
    temperature_c: float | None = None
    humidity_pct: float | None = None
    dew_point_c: float | None = None
    wet_bulb_c: float | None = None
    wind_kmh: float | None = None
    wind_dir_deg: float | None = None
    gust_kmh: float | None = None
    cloud_cover_pct: float | None = None
    cloud_cover_low_pct: float | None = None
    precipitation_mm: float | None = None
    temperature_80m_c: float | None = None
    weather_code: int | None = None


@dataclass(frozen=True, slots=True)
class DayRain:
    date: date
    mm: float | None
    probability_pct: float | None


@dataclass(frozen=True, slots=True)
class FrostVerdict:
    level: Level
    min_2m_c: float | None
    ground_estimate_c: float | None
    models_agreeing: str
    reason: str
    radiative: bool | None


@dataclass(frozen=True, slots=True)
class SprayHour:
    time: datetime
    level: Level
    causes: tuple[str, ...]  # worst first; empty when green


@dataclass(frozen=True, slots=True)
class SprayVerdict:
    level: Level
    best_window: tuple[datetime, datetime] | None
    reason: str
    daylight_left: bool
    hours: tuple[SprayHour, ...] = ()


@dataclass(frozen=True, slots=True)
class FieldVerdict:
    level: Level
    next_rain: DayRain | None
    reason: str


def wet_bulb_stull(temperature_c: float, humidity_pct: float) -> float:
    """Wet-bulb temperature from Stull (2011), error < 0.3 °C (rules doc §2)."""
    t, rh = temperature_c, humidity_pct
    return (
        t * math.atan(0.151977 * math.sqrt(rh + 8.313659))
        + math.atan(t + rh)
        - math.atan(rh - 1.676331)
        + 0.00391838 * rh**1.5 * math.atan(0.023101 * rh)
        - 4.686035
    )


def wind_2m(wind_10m_kmh: float, factor: float = WIND_2M_FACTOR) -> float:
    """u2 = 0.75 · u10 (FAO-56, eq. 47; rules doc §2)."""
    return wind_10m_kmh * factor


def worst(levels) -> Level:
    return max(levels, key=SEVERITY.__getitem__, default="ok")
