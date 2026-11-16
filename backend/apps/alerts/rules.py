"""What each rule variable accepts, and how a rule reads in Spanish."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from .models import AlertRule

V = AlertRule.Variable
C = AlertRule.Comparator


@dataclass(frozen=True)
class VariableSpec:
    noun: str  # used in "Para {noun} usá …"
    comparators: tuple[str, ...]
    low: int
    high: int
    unit: str


SPECS: dict[str, VariableSpec] = {
    V.FROST: VariableSpec("helada", (C.LT, C.LTE), -15, 10, "°C"),
    V.TEMP_MIN: VariableSpec("temperatura", (C.LT, C.LTE, C.GT, C.GTE), -30, 50, "°C"),
    V.TEMP_MAX: VariableSpec("temperatura", (C.LT, C.LTE, C.GT, C.GTE), -30, 50, "°C"),
    V.RAIN: VariableSpec("lluvia", (C.GT, C.GTE), 0, 500, "mm"),
    V.WIND: VariableSpec("viento", (C.GT, C.GTE), 0, 200, "km/h"),
}

COMPARATOR_WORDS = {
    C.LT: "menor a",
    C.LTE: "menor o igual a",
    C.GT: "mayor a",
    C.GTE: "mayor o igual a",
}


def _quoted(comparators: tuple[str, ...]) -> str:
    words = [f"«{COMPARATOR_WORDS[c]}»" for c in comparators]
    return " o ".join(words)


def validation_errors(
    variable: str, comparator: str | None, threshold: Decimal | None
) -> dict[str, str]:
    """Field → first problem, in Spanish; empty when the rule makes sense."""
    if variable == V.SPRAY_WINDOW:
        if threshold is not None:
            return {"threshold": "La ventana de pulverización no lleva valor."}
        if comparator is not None:
            return {"comparator": "La ventana de pulverización no lleva comparación."}
        return {}
    spec = SPECS[variable]
    errors: dict[str, str] = {}
    if comparator is None:
        errors["comparator"] = "Elegí cómo comparar."
    elif comparator not in spec.comparators:
        errors["comparator"] = f"Para {spec.noun} usá {_quoted(spec.comparators)}."
    if threshold is None:
        errors["threshold"] = "Poné un valor."
    elif not spec.low <= threshold <= spec.high:
        errors["threshold"] = f"Usá un valor entre {spec.low} y {spec.high} {spec.unit}."
    return errors


def number(value: Decimal | float) -> str:
    """2.5 → "2,5"; 35.0 → "35"."""
    return f"{float(value):g}".replace(".", ",")


def describe(variable: str, comparator: str | None, threshold, lote_name: str) -> str:
    if variable == V.SPRAY_WINDOW:
        text = "Ventana para pulverizar"
    elif variable == V.FROST:
        t = number(threshold)
        text = (
            f"Helada en el suelo de {t} °C o menos"
            if comparator == C.LTE
            else f"Helada en el suelo por debajo de {t} °C"
        )
    else:
        cmp = COMPARATOR_WORDS[comparator]
        t = number(threshold)
        text = {
            V.TEMP_MIN: f"Mínima {cmp} {t} °C",
            V.TEMP_MAX: f"Máxima {cmp} {t} °C",
            V.RAIN: f"Lluvia {cmp} {t} mm en el día",
            V.WIND: f"Viento {cmp} {t} km/h",
        }[variable]
    return f"{text} en {lote_name}"
