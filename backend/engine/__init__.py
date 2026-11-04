"""Decisions engine v0: pure Python, no Django.

Rules and thresholds come from Doc/reglas-agronomicas.md (see `config`). Every
verdict is an estimate from published rules, not yet validated by backtesting.
"""

from .config import DEFAULT, ENGINE_VERSION, HEAVY_RAIN_MM, Thresholds
from .fieldwork import field_work, sky
from .frost import frost_tonight
from .headline import Headline, headline
from .series import (
    SEVERITY,
    DayRain,
    FieldVerdict,
    FrostVerdict,
    Hour,
    Level,
    Sky,
    SprayHour,
    SprayVerdict,
    wet_bulb_stull,
    wind_2m,
)
from .spray import rate_spray_hour, spray_today

__all__ = [
    "DEFAULT",
    "ENGINE_VERSION",
    "HEAVY_RAIN_MM",
    "SEVERITY",
    "DayRain",
    "FieldVerdict",
    "FrostVerdict",
    "Headline",
    "Hour",
    "Level",
    "Sky",
    "SprayHour",
    "SprayVerdict",
    "Thresholds",
    "field_work",
    "frost_tonight",
    "headline",
    "rate_spray_hour",
    "sky",
    "spray_today",
    "wet_bulb_stull",
    "wind_2m",
]
