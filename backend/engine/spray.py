"""Spray window today (rules doc §2): each hour takes the worst state of all rules."""

from collections import Counter
from collections.abc import Sequence
from datetime import datetime, timedelta

from .config import DEFAULT, Thresholds
from .series import SEVERITY, Hour, Level, SprayHour, SprayVerdict, wet_bulb_stull, wind_2m

HOUR = timedelta(hours=1)


def _band(value: float, green: tuple[float, float], red: tuple[float, float]) -> int:
    """0 green inside `green`, 2 red outside `red`, 1 yellow in between (bounds inclusive)."""
    if green[0] <= value <= green[1]:
        return 0
    if value < red[0] or value > red[1]:
        return 2
    return 1


def _inversion(hour: Hour, sunrise: datetime, sunset: datetime, cfg: Thresholds) -> int:
    t80, t2 = hour.temperature_80m_c, hour.temperature_c
    if t80 is not None and t2 is not None and t80 - t2 > 0:
        return 2  # the 80 m signal confirms it; it cannot rule one out
    after_sunrise = sunrise + timedelta(hours=cfg.inversion_hours_after_sunrise)
    if sunrise <= hour.time < after_sunrise or hour.time < sunrise or hour.time >= sunset:
        cloud, wind = hour.cloud_cover_pct, hour.wind_kmh
        clear = cloud is not None and cloud < cfg.inversion_max_cloud_pct
        calm = wind is not None and wind < cfg.inversion_max_wind_10m_kmh
        return int(clear) + int(calm)  # both: probable (red); one: doubtful (yellow)
    return 0


def rate_spray_hour(
    hours: Sequence[Hour],
    index: int,
    sunrise: datetime,
    sunset: datetime,
    wash_hours: int | None = None,
    cfg: Thresholds = DEFAULT,
) -> SprayHour:
    """Rate `hours[index]`. Neighbouring hours give the rain before and after it.

    Open-Meteo precipitation at time t is the rain of the hour ending at t, so
    the wash window is t+1 … t+wash_hours and "the previous 2 h" is t−1 … t.
    """
    hour = hours[index]
    wash_hours = cfg.rain_wash_hours if wash_hours is None else wash_hours
    findings: list[tuple[int, str]] = []
    t = hour.temperature_c
    if t is None or hour.wind_kmh is None:
        return SprayHour(time=hour.time, level="critical", causes=("faltan datos",))

    wet_bulb = hour.wet_bulb_c
    if wet_bulb is None and hour.humidity_pct is not None:
        wet_bulb = wet_bulb_stull(t, hour.humidity_pct)
    delta_t: float | None = None
    if wet_bulb is not None:
        delta_t = t - wet_bulb
        state = _band(delta_t, (cfg.delta_t_min, cfg.delta_t_max), (-1e9, cfg.delta_t_red_above))
        if state:
            findings.append(
                (state, "Delta T bajo" if delta_t < cfg.delta_t_min else "Delta T alto")
            )

    findings.extend(wind_findings(hour.wind_kmh, hour.gust_kmh, cfg))

    state = _band(t, (-1e9, cfg.spray_temp_max_c), (-1e9, cfg.spray_temp_red_above_c))
    if state:
        findings.append((state, "mucho calor"))

    inversion = _inversion(hour, sunrise, sunset, cfg)
    if inversion:
        findings.append(
            (
                inversion,
                "inversión térmica probable" if inversion == 2 else "posible inversión térmica",
            )
        )

    later = hours[index + 1 : index + 1 + wash_hours]
    if any((h.precipitation_mm or 0) >= cfg.rain_wash_mm for h in later):
        findings.append((2, f"lluvia en las próximas {wash_hours} h"))

    before = hours[max(0, index - cfg.wet_leaf_hours + 1) : index + 1]
    rained = sum(h.precipitation_mm or 0 for h in before) >= cfg.wet_leaf_rain_mm
    dew = hour.dew_point_c is not None and t - hour.dew_point_c < cfg.wet_leaf_dew_spread_c
    if rained or dew:
        findings.append((1, "hoja mojada"))

    findings.sort(key=lambda f: -f[0])  # stable: rule order within a level
    level: Level = ("ok", "caution", "critical")[findings[0][0]] if findings else "ok"
    return SprayHour(
        time=hour.time,
        level=level,
        causes=tuple(c for _, c in findings),
        delta_t_c=delta_t,
        inversion=bool(inversion),
    )


def wind_findings(
    wind_kmh: float, gust_kmh: float | None, cfg: Thresholds = DEFAULT
) -> list[tuple[int, str]]:
    """Wind and gust findings at 2 m for one hour (0 green, 1 yellow, 2 red)."""
    findings: list[tuple[int, str]] = []
    u2 = wind_2m(wind_kmh, cfg.wind_2m_factor)
    state = _band(
        u2, (cfg.wind_2m_min, cfg.wind_2m_max), (cfg.wind_2m_red_below, cfg.wind_2m_red_above)
    )
    if state:
        findings.append((state, "poco viento" if u2 < cfg.wind_2m_min else "mucho viento"))
    if gust_kmh is not None:
        gust = wind_2m(gust_kmh, cfg.wind_2m_factor)
        state = _band(gust, (0, cfg.gust_2m_max), (-1e9, cfg.gust_2m_red_above))
        if state:
            findings.append((state, "ráfagas fuertes"))
    return findings


def rate_wind(
    wind_kmh: float, gust_kmh: float | None, cfg: Thresholds = DEFAULT
) -> tuple[Level, tuple[str, ...]]:
    """The spray verdict's wind part alone: what an applicator's record needs for a past hour."""
    findings = sorted(wind_findings(wind_kmh, gust_kmh, cfg), key=lambda f: -f[0])
    level: Level = ("ok", "caution", "critical")[findings[0][0]] if findings else "ok"
    return level, tuple(cause for _, cause in findings)


def _main_cause(rated: Sequence[SprayHour]) -> str:
    counts = Counter(h.causes[0] for h in rated if h.causes)
    order = [h.causes[0] for h in rated if h.causes]
    return max(counts, key=lambda c: (counts[c], -order.index(c)))


def _hour_label(time: datetime) -> str:
    return f"{time.hour}"


def spray_today(
    hours: Sequence[Hour],
    now: datetime,
    sunrise: datetime | None,
    sunset: datetime | None,
    wash_hours: int | None = None,
    cfg: Thresholds = DEFAULT,
) -> SprayVerdict:
    """Best window = longest run of green hours from now (or sunrise) to sunset."""
    if sunrise is None or sunset is None:
        return SprayVerdict(
            level="caution",
            best_window=None,
            reason="Faltan datos para evaluar la pulverización de hoy.",
            daylight_left=False,
        )
    current = now.replace(minute=0, second=0, microsecond=0)
    candidates = [
        i
        for i, h in enumerate(hours)
        if h.time.date() == sunrise.date()
        and h.time >= sunrise
        and h.time < sunset
        and h.time >= current
    ]
    if not candidates:
        return SprayVerdict(
            level="caution",
            best_window=None,
            reason="Ya no quedan horas de luz para pulverizar hoy.",
            daylight_left=False,
        )

    rated = [rate_spray_hour(hours, i, sunrise, sunset, wash_hours, cfg) for i in candidates]
    best: list[SprayHour] = []
    run: list[SprayHour] = []
    for hour in rated:
        if hour.level == "ok" and (not run or hour.time - run[-1].time == HOUR):
            run.append(hour)
        elif hour.level == "ok":
            run = [hour]
        else:
            run = []
        if len(run) > len(best):
            best = list(run)

    not_green = [h for h in rated if h.level != "ok"]
    if best:
        window = (best[0].time, best[-1].time + HOUR)
        span = f"de {_hour_label(window[0])} a {_hour_label(window[1])} h"
        if len(best) >= cfg.spray_min_window_hours:
            level: Level = "ok"
            reason = f"Buena ventana {span}."
        else:
            level = "caution"
            reason = f"Ventana corta {span}; el resto del día, {_main_cause(not_green)}."
        return SprayVerdict(level, window, reason, True, tuple(rated))

    if all(SEVERITY[h.level] == 2 for h in rated):
        reason = f"Hoy no conviene pulverizar: {_main_cause(rated)}."
        return SprayVerdict("critical", None, reason, True, tuple(rated))
    yellow = [h for h in rated if h.level == "caution"]
    reason = f"Hoy no hay horas buenas para pulverizar: {_main_cause(yellow)}."
    return SprayVerdict("caution", None, reason, True, tuple(rated))
