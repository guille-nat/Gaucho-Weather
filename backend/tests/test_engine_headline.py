"""The lote card headline: the most urgent decision (S5)."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from engine import DayRain, FieldVerdict, FrostVerdict, SprayVerdict, headline

ART = ZoneInfo("America/Argentina/Buenos_Aires")


def frost(level, ground=1.0):
    return FrostVerdict(level, 3.0, ground, "1 de 3 modelos", "razón helada", True)


def spray(level, window=True, daylight_left=True):
    best = (datetime(2026, 11, 3, 9, tzinfo=ART), datetime(2026, 11, 3, 13, tzinfo=ART))
    return SprayVerdict(level, best if window else None, "razón pulverización", daylight_left)


FIELD_OK = FieldVerdict("ok", None, "No se esperan lluvias de 5 mm o más en los próximos 7 días.")
FIELD_CAUTION = FieldVerdict(
    "caution",
    DayRain(date(2026, 11, 5), 12.0, 40),
    "Jueves podrían caer 12 mm (40 %): adelantá las labores si podés.",
)


def test_critical_frost_wins():
    assert headline(frost("critical", -3.0), spray("critical", False), FIELD_CAUTION) == {
        "level": "critical",
        "text": "Helada esta noche: en el suelo puede bajar a −3 °C.",
    }


def test_frost_caution_text():
    assert headline(frost("caution", 0.7), spray("ok"), FIELD_OK) == {
        "level": "caution",
        "text": "Ojo con la helada: en el suelo puede bajar a 0,7 °C.",
    }


def test_field_work_beats_spray_on_a_tie():
    assert headline(frost("ok", 6.0), spray("caution"), FIELD_CAUTION) == {
        "level": "caution",
        "text": "Jueves podrían caer 12 mm (40 %).",
    }


def test_spray_when_it_is_the_most_urgent():
    assert headline(frost("ok", 6.0), spray("critical", False), FIELD_OK) == {
        "level": "critical",
        "text": "razón pulverización",
    }


def test_all_ok_shows_the_spray_window():
    assert headline(frost("ok", 6.0), spray("ok"), FIELD_OK) == {
        "level": "ok",
        "text": "Ventana para pulverizar de 9 a 13 h.",
    }


def test_spray_without_daylight_left_is_skipped():
    assert headline(frost("ok", 6.0), spray("caution", False, False), FIELD_OK) == {
        "level": "ok",
        "text": "Sin helada esta noche.",
    }


def test_frost_without_data_uses_its_reason():
    no_data = FrostVerdict("caution", None, None, "0 de 0 modelos", "Sin datos.", None)
    assert headline(no_data, spray("ok"), FIELD_OK)["text"] == "Sin datos."
