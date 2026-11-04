"""Frost tonight at ground level (rules doc §1)."""

from collections.abc import Mapping, Sequence
from datetime import datetime
from statistics import mean, median

from .config import DEFAULT, Thresholds
from .series import FrostVerdict, Hour
from .text import number


def _is_radiative(hours: Sequence[Hour], cfg: Thresholds) -> bool:
    """Clear and calm night, from the night means of wind and low cloud [I]."""
    winds = [h.wind_kmh for h in hours if h.wind_kmh is not None]
    clouds = [
        h.cloud_cover_low_pct if h.cloud_cover_low_pct is not None else h.cloud_cover_pct
        for h in hours
    ]
    clouds = [c for c in clouds if c is not None]
    if not winds or not clouds:
        return False
    return (
        mean(winds) < cfg.radiative_max_wind_kmh and mean(clouds) < cfg.radiative_max_low_cloud_pct
    )


def frost_tonight(
    models: Mapping[str, Sequence[Hour]],
    start: datetime,
    end: datetime,
    cfg: Thresholds = DEFAULT,
) -> FrostVerdict:
    """Ground estimate per model, then the median and how many models freeze."""
    minima: list[float] = []
    grounds: list[float] = []
    radiative_votes: list[bool] = []
    for hours in models.values():
        night = [h for h in hours if start <= h.time <= end and h.temperature_c is not None]
        if not night:
            continue
        tmin = min(h.temperature_c for h in night)
        radiative = _is_radiative(night, cfg)
        delta = cfg.ground_delta_radiative_c if radiative else cfg.ground_delta_other_c
        minima.append(tmin)
        grounds.append(tmin - delta)
        radiative_votes.append(radiative)

    total = len(grounds)
    if not total:
        return FrostVerdict(
            level="caution",
            min_2m_c=None,
            ground_estimate_c=None,
            models_agreeing="0 de 0 modelos",
            reason="Sin datos de temperatura para esta noche.",
            radiative=None,
        )

    freezing = sum(g <= cfg.frost_ground_c for g in grounds)
    ground = round(median(grounds), 1)
    radiative = sum(radiative_votes) * 2 > total
    if freezing * 2 > total:
        level = "critical"
    elif freezing or ground <= cfg.frost_caution_ground_c:
        level = "caution"
    else:
        level = "ok"

    sky = "Noche despejada y calma" if radiative else "Noche nublada o con viento"
    if freezing == 0:
        agreement = "Ningún modelo da helada."
    elif freezing == 1:
        agreement = f"1 de {total} modelos da helada."
    else:
        agreement = f"{freezing} de {total} modelos dan helada."
    return FrostVerdict(
        level=level,
        min_2m_c=round(median(minima), 1),
        ground_estimate_c=ground,
        models_agreeing=f"{freezing} de {total} modelos",
        reason=f"{sky}: en el suelo puede bajar a {number(ground)} °C. {agreement}",
        radiative=radiative,
    )
