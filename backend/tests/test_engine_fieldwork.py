"""Field work / next rain (S3) and the daily sky label (S5)."""

from datetime import date, timedelta

import pytest

from engine import ENGINE_VERSION, HEAVY_RAIN_MM, DayRain, field_work, sky

TODAY = date(2026, 11, 3)  # a Tuesday


def week(rain_by_offset, probability_by_offset=None):
    probability_by_offset = probability_by_offset or {}
    return [
        DayRain(
            date=TODAY + timedelta(days=i),
            mm=rain_by_offset.get(i, 0.0),
            probability_pct=probability_by_offset.get(i),
        )
        for i in range(7)
    ]


def test_engine_constants():
    assert ENGINE_VERSION == "v0"
    assert HEAVY_RAIN_MM == 5.0


def test_likely_heavy_rain_is_critical():
    verdict = field_work(week({1: 2.0, 2: 12.0, 4: 30.0}, {2: 80}), TODAY)

    assert verdict.level == "critical"
    assert verdict.next_rain == DayRain(date=date(2026, 11, 5), mm=12.0, probability_pct=80)
    assert verdict.reason == (
        "Jueves se esperan 12 mm (80 %): no entres con la sembradora; el piso tarda en orear."
    )


def test_less_likely_heavy_rain_is_caution():
    verdict = field_work(week({2: 12.0}, {2: 40}), TODAY)

    assert verdict.level == "caution"
    assert verdict.reason == "Jueves podrían caer 12 mm (40 %): adelantá las labores si podés."


def test_heavy_rain_without_ensemble_probability_is_caution():
    verdict = field_work(week({2: 12.4}), TODAY)

    assert verdict.level == "caution"
    assert verdict.next_rain.probability_pct is None
    assert verdict.reason == "Jueves podrían caer 12,4 mm: adelantá las labores si podés."


def test_below_the_heavy_rain_threshold_is_ok():
    verdict = field_work(week({0: 4.9, 3: 4.0}, {0: 90}), TODAY)

    assert verdict.level == "ok"
    assert verdict.next_rain is None
    assert verdict.reason == "No se esperan lluvias de 5 mm o más en los próximos 7 días."


@pytest.mark.parametrize(("offset", "name"), [(0, "Hoy"), (1, "Mañana"), (5, "Domingo")])
def test_day_names(offset, name):
    verdict = field_work(week({offset: 8.0}, {offset: 90}), TODAY)

    assert verdict.reason.startswith(f"{name} se esperan 8 mm (90 %)")


def test_threshold_is_configurable():
    from engine import Thresholds

    verdict = field_work(week({0: 4.9}), TODAY, Thresholds(heavy_rain_mm=4.0))

    assert verdict.next_rain.mm == 4.9


@pytest.mark.parametrize(
    ("rain", "cloud", "thunder", "label"),
    [
        (3.0, 90.0, True, "tormenta"),
        (3.0, 90.0, False, "lluvia"),
        (0.5, 90.0, False, "nublado"),
        (0.0, 50.0, False, "parcial"),
        (0.0, 10.0, False, "sol"),
        (None, None, False, "parcial"),
    ],
)
def test_sky(rain, cloud, thunder, label):
    assert sky(rain, cloud, thunder) == label
