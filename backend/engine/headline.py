"""One short line for the lote card: the most urgent decision."""

from typing import TypedDict

from .series import SEVERITY, FieldVerdict, FrostVerdict, Level, SprayVerdict
from .text import number


class Headline(TypedDict):
    level: Level
    text: str


def _frost_text(verdict: FrostVerdict) -> str:
    if verdict.ground_estimate_c is None:
        return verdict.reason
    ground = number(verdict.ground_estimate_c)
    if verdict.level == "critical":
        return f"Helada esta noche: en el suelo puede bajar a {ground} °C."
    if verdict.level == "caution":
        return f"Ojo con la helada: en el suelo puede bajar a {ground} °C."
    return "Sin helada esta noche."


def _field_text(verdict: FieldVerdict) -> str:
    if verdict.next_rain is None:
        return verdict.reason
    return verdict.reason.split(":")[0] + "."


def _spray_text(verdict: SprayVerdict) -> str:
    if verdict.level == "ok" and verdict.best_window:
        start, end = verdict.best_window
        return f"Ventana para pulverizar de {start.hour} a {end.hour} h."
    return verdict.reason


def headline(frost: FrostVerdict, spray: SprayVerdict, field: FieldVerdict) -> Headline:
    """Worst level wins; ties go frost, field work, spray.

    When everything is ok, a spray window is the most useful line. A spray
    verdict with no daylight left today says nothing about the lote, so it is skipped.
    """
    options = [(frost, _frost_text(frost)), (field, _field_text(field))]
    if spray.daylight_left:
        options.append((spray, _spray_text(spray)))
    top = max(SEVERITY[verdict.level] for verdict, _ in options)
    if top == 0 and spray.daylight_left and spray.best_window:
        return {"level": "ok", "text": _spray_text(spray)}
    verdict, text = next(o for o in options if SEVERITY[o[0].level] == top)
    return {"level": verdict.level, "text": text}
