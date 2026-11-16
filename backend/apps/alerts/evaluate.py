"""Which custom rules hold on a forecast payload (odd/tasks/cuenta-planes-alertas.md S6).

Pure: it reads the per-cell S5 payload built by `apps.archiver.forecast.build_forecast` and
never touches the database. The window is the rest of today (hours after `now`) plus all of
tomorrow, in local time; at most one Trigger per day for a rule.

Payload fields used:
- `hourly[]` (48 h from the current hour): `time`, `temperature_c`, `wind_kmh`, `gust_kmh`,
  `rain_mm`. The first entry is the current hour, already started, so only stamps after
  `now` count.
- `daily[]`: `date`, `rain_mm`. Tomorrow's rain is the daily total (the median across models
  of each model's day sum, the number the forecast screen shows). Today's rain is the sum of
  the remaining hourly values, since the daily total includes hours already past.
- `decisions.frost_tonight.ground_estimate_c` and `decisions.spray_today.best_window`.
"""

from __future__ import annotations

import operator
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta

from django.utils import timezone

from apps.archiver.forecast import TZ
from apps.archiver.summary import tonight_window

from . import rules
from .models import AlertRule

V = AlertRule.Variable
TITLE_MAX = 120  # AlertEvent.title max_length

COMPARE: dict[str, Callable[[float, float], bool]] = {
    AlertRule.Comparator.LT: operator.lt,
    AlertRule.Comparator.LTE: operator.le,
    AlertRule.Comparator.GT: operator.gt,
    AlertRule.Comparator.GTE: operator.ge,
}


@dataclass(frozen=True)
class Trigger:
    target_date: date
    value: float
    at: str | None  # ISO local time of the deciding hour; None for daily values
    title: str
    body: str


@dataclass(frozen=True)
class _Hour:
    time: datetime  # local
    raw: dict


def evaluate(rule: AlertRule, payload: dict, now: datetime) -> list[Trigger]:
    now_local = timezone.localtime(now, TZ)
    today = now_local.date()
    days = (today, today + timedelta(days=1))
    hours = [
        _Hour(time, entry)
        for entry in payload.get("hourly") or []
        if (time := datetime.fromisoformat(entry["time"]).astimezone(TZ)) > now_local
        and time.date() in days
    ]
    lote = rule.lote.name
    if rule.variable == V.SPRAY_WINDOW:
        found = _spray(payload, today, lote)
    elif rule.variable == V.FROST:
        found = _frost(payload, now_local, _holds(rule), lote)
    elif rule.variable == V.RAIN:
        found = _rain(payload, hours, days, _holds(rule), lote)
    else:
        found = _hourly(rule.variable, hours, days, _holds(rule), lote)
    description = rules.describe(rule.variable, rule.comparator, rule.threshold, lote)
    return [_with_body(t, description) for t in found]


_FIELD = {V.TEMP_MIN: "temperature_c", V.TEMP_MAX: "temperature_c", V.WIND: "wind_kmh"}


def _holds(rule: AlertRule) -> Callable[[float], bool]:
    if rule.comparator not in COMPARE or rule.threshold is None:
        return lambda value: False
    compare, threshold = COMPARE[rule.comparator], float(rule.threshold)
    return lambda value: compare(value, threshold)


def _extreme(hours: list[_Hour], field: str, pick) -> _Hour | None:
    present = [h for h in hours if h.raw.get(field) is not None]
    return pick(present, key=lambda h: h.raw[field]) if present else None


def _day_word(day: date, today: date) -> str:
    return "hoy" if day == today else "mañana"


def _clock(moment: datetime | str) -> str:
    if isinstance(moment, str):
        moment = datetime.fromisoformat(moment)
    return moment.astimezone(TZ).strftime("%H:%M")


def _title(text: str) -> str:
    return text if len(text) <= TITLE_MAX else text[: TITLE_MAX - 1] + "…"


def _with_body(trigger: Trigger, description: str) -> Trigger:
    """Prefix the rule that fired, so the inbox row explains itself."""
    return replace(trigger, body=f"Tu regla: {description}. {trigger.body}")


def _hourly(variable, hours, days, holds, lote) -> list[Trigger]:
    """temp_min / temp_max / wind: the day's extreme among the hours still to come."""
    field = _FIELD[variable]
    pick = min if variable == V.TEMP_MIN else max
    found = []
    for day in days:
        day_hours = [h for h in hours if h.time.date() == day]
        hour = _extreme(day_hours, field, pick)
        if hour is not None and holds(float(hour.raw[field])):
            found.append(_hourly_trigger(variable, day, days[0], hour, day_hours, lote))
    return found


def _hourly_trigger(variable, day, today, hour, day_hours, lote) -> Trigger:
    value = float(hour.raw[_FIELD[variable]])
    when = _day_word(day, today)
    at = hour.raw["time"]
    v = rules.number(value)
    if variable == V.TEMP_MIN:
        title = f"Mínima de {v} °C {when} en {lote}"
        body = f"Se esperan {v} °C {when} a las {_clock(at)}."
    elif variable == V.TEMP_MAX:
        title = f"Máxima de {v} °C {when} en {lote}"
        body = f"Se esperan {v} °C {when} a las {_clock(at)}."
    else:
        title = f"Viento de {v} km/h {when} en {lote}"
        body = f"Se espera viento de {v} km/h {when} a las {_clock(at)}"
        gust = _extreme(day_hours, "gust_kmh", max)
        if gust is not None:
            body += f", con ráfagas de hasta {rules.number(gust.raw['gust_kmh'])} km/h"
        body += "."
    return Trigger(day, value, at, _title(title), body)


def _rain(payload, hours, days, holds, lote) -> list[Trigger]:
    today, tomorrow = days
    remaining = [h.raw["rain_mm"] for h in hours if h.time.date() == today]
    remaining = [mm for mm in remaining if mm is not None]
    totals = {today: round(sum(remaining), 1) if remaining else None}
    for day in payload.get("daily") or []:
        if day.get("date") == tomorrow.isoformat():
            totals[tomorrow] = day.get("rain_mm")
    found = []
    for day, total in totals.items():
        if total is None or not holds(float(total)):
            continue
        v = rules.number(total)
        when = _day_word(day, today)
        detail = "en lo que queda de hoy" if day == today else "mañana"
        found.append(
            Trigger(
                day,
                float(total),
                None,
                _title(f"Lluvia de {v} mm {when} en {lote}"),
                f"Se esperan {v} mm {detail}.",
            )
        )
    return found


def _frost(payload, now_local, holds, lote) -> list[Trigger]:
    frost = (payload.get("decisions") or {}).get("frost_tonight") or {}
    ground = frost.get("ground_estimate_c")
    if ground is None or not holds(float(ground)):
        return []
    # The night the payload describes: before 08:00 it is the one that started yesterday,
    # so an evening run and a pre-dawn run of the same night share one (rule, day).
    night_start, _ = tonight_window(now_local.replace(tzinfo=None))
    v = rules.number(ground)
    return [
        Trigger(
            night_start.date(),
            float(ground),
            None,
            _title(f"Helada en el suelo de {v} °C esta noche en {lote}"),
            f"Se estiman {v} °C en el suelo esta noche.",
        )
    ]


def _spray(payload, today, lote) -> list[Trigger]:
    spray = (payload.get("decisions") or {}).get("spray_today") or {}
    window = spray.get("best_window")
    if not window:
        return []
    start, end = datetime.fromisoformat(window["start"]), datetime.fromisoformat(window["end"])
    hours = (end - start).total_seconds() / 3600
    return [
        Trigger(
            today,
            hours,
            window["start"],
            _title(f"Ventana para pulverizar hoy en {lote}"),
            f"Mejor momento hoy de {_clock(start)} a {_clock(end)}.",
        )
    ]
