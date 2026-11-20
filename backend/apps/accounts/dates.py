"""Dates in the words the emails use, like the SPA's `formatDate`."""

from datetime import date

MONTHS = (
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
)


def long_date(day: date) -> str:
    """`20 de diciembre de 2026`."""
    return f"{day.day} de {MONTHS[day.month - 1]} de {day.year}"
