"""Spanish wording helpers for the reasons."""

from datetime import date, timedelta

WEEKDAYS = ("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo")


def number(value: float) -> str:
    """One decimal with a comma, no trailing ",0", and a real minus sign: −1,5."""
    rounded = round(value, 1)
    if rounded == 0:
        rounded = 0.0  # avoid "−0"
    text = f"{abs(rounded):.1f}".replace(".", ",").removesuffix(",0")
    return f"−{text}" if rounded < 0 else text


def day_name(day: date, today: date) -> str:
    if day == today:
        return "Hoy"
    if day == today + timedelta(days=1):
        return "Mañana"
    return WEEKDAYS[day.weekday()]
