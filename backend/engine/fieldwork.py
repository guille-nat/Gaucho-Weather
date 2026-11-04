"""Field work: the next heavy rain (rules doc §3) and the daily sky label."""

from collections.abc import Sequence
from datetime import date

from .config import DEFAULT, Thresholds
from .series import DayRain, FieldVerdict, Sky
from .text import day_name, number


def field_work(days: Sequence[DayRain], today: date, cfg: Thresholds = DEFAULT) -> FieldVerdict:
    """First day from today with ≥ HEAVY_RAIN_MM; critical when it is likely."""
    heavy = next(
        (d for d in days if d.date >= today and d.mm is not None and d.mm >= cfg.heavy_rain_mm),
        None,
    )
    if heavy is None:
        return FieldVerdict(
            level="ok",
            next_rain=None,
            reason=(
                f"No se esperan lluvias de {number(cfg.heavy_rain_mm)} mm o más "
                f"en los próximos {len(days)} días."
            ),
        )
    name = day_name(heavy.date, today)
    amount = f"{number(heavy.mm)} mm"
    probability = heavy.probability_pct
    if probability is not None and probability >= cfg.field_critical_probability_pct:
        return FieldVerdict(
            level="critical",
            next_rain=heavy,
            reason=(
                f"{name} se esperan {amount} ({number(probability)} %): no entres con la "
                "sembradora; el piso tarda en orear."
            ),
        )
    detail = f" ({number(probability)} %)" if probability is not None else ""
    return FieldVerdict(
        level="caution",
        next_rain=heavy,
        reason=f"{name} podrían caer {amount}{detail}: adelantá las labores si podés.",
    )


def sky(
    rain_mm: float | None,
    cloud_cover_pct: float | None,
    thunder: bool,
    cfg: Thresholds = DEFAULT,
) -> Sky:
    if thunder:
        return "tormenta"
    if rain_mm is not None and rain_mm >= cfg.sky_rain_mm:
        return "lluvia"
    if cloud_cover_pct is None:
        return "parcial"
    if cloud_cover_pct < cfg.sky_sunny_max_cloud_pct:
        return "sol"
    if cloud_cover_pct < cfg.sky_partly_max_cloud_pct:
        return "parcial"
    return "nublado"
