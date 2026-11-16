"""evaluate(rule, payload, now): which rules hold on the forecast payload (S6)."""

import dataclasses
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest

from apps.alerts.evaluate import Trigger, evaluate
from apps.alerts.models import AlertRule
from apps.lotes.models import Lote

NOW = datetime(2026, 11, 3, 18, 20, tzinfo=UTC)  # 15:20 in Buenos Aires
TODAY = date(2026, 11, 3)
TOMORROW = date(2026, 11, 4)
FIRST_HOUR = datetime(2026, 11, 3, 15, 0)  # the hourly list starts at the current hour


def rule(variable="temp_min", comparator="lt", threshold="2", lote_name="Lote Norte"):
    return AlertRule(
        variable=variable,
        comparator=comparator,
        threshold=None if threshold is None else Decimal(threshold),
        lote=Lote(name=lote_name),
    )


def payload(hours=None, daily_rain=None, frost_c=None, spray_window=None):
    """An S5 forecast payload: 48 mild, calm, dry hours; `hours` maps a local stamp to values."""
    hours = hours or {}
    hourly = []
    for i in range(48):
        stamp = (FIRST_HOUR + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M")
        values = {"temperature_c": 15.0, "wind_kmh": 10.0, "gust_kmh": 20.0, "rain_mm": 0.0}
        values.update(hours.get(stamp, {}))
        hourly.append(
            {
                "time": f"{stamp}:00-03:00",
                "humidity_pct": 60,
                "rain_probability_pct": None,
                **values,
            }
        )
    daily_rain = daily_rain or {}
    daily = [
        {
            "date": (TODAY + timedelta(days=i)).isoformat(),
            "max_c": 20.0,
            "min_c": 10.0,
            "rain_mm": daily_rain.get(TODAY + timedelta(days=i), 0.0),
            "rain_probability_pct": None,
            "sky": "sol",
        }
        for i in range(7)
    ]
    window = (
        {"start": f"{spray_window[0]}:00-03:00", "end": f"{spray_window[1]}:00-03:00"}
        if spray_window
        else None
    )
    return {
        "fetched_at": "2026-11-03T12:00:00-03:00",
        "hourly": hourly,
        "daily": daily,
        "decisions": {
            "frost_tonight": {
                "level": "ok",
                "min_2m_c": None,
                "ground_estimate_c": frost_c,
                "models_agreeing": 0,
                "reason": "",
            },
            "spray_today": {"level": "ok", "best_window": window, "reason": ""},
        },
    }


def test_trigger_is_a_frozen_dataclass():
    trigger = Trigger(target_date=TODAY, value=1.0, at=None, title="t", body="b")

    with pytest.raises(dataclasses.FrozenInstanceError):
        trigger.value = 2.0


class TestTemperature:
    def test_minimum_below_threshold_tomorrow(self):
        forecast = payload({"2026-11-04T05:00": {"temperature_c": 1.2}})

        [trigger] = evaluate(rule("temp_min", "lt", "2"), forecast, NOW)

        assert trigger.target_date == TOMORROW
        assert trigger.value == 1.2
        assert trigger.at == "2026-11-04T05:00:00-03:00"
        assert trigger.title == "Mínima de 1,2 °C mañana en Lote Norte"
        assert "Mínima menor a 2 °C en Lote Norte" in trigger.body
        assert "05:00" in trigger.body

    def test_one_trigger_per_day_with_the_extreme_value(self):
        forecast = payload(
            {
                "2026-11-04T04:00": {"temperature_c": 1.5},
                "2026-11-04T05:00": {"temperature_c": 0.5},
                "2026-11-04T06:00": {"temperature_c": 1.0},
            }
        )

        triggers = evaluate(rule("temp_min", "lt", "2"), forecast, NOW)

        assert [(t.target_date, t.value) for t in triggers] == [(TOMORROW, 0.5)]

    def test_lt_excludes_and_lte_includes_the_threshold(self):
        forecast = payload({"2026-11-04T05:00": {"temperature_c": 2.0}})

        assert evaluate(rule("temp_min", "lt", "2"), forecast, NOW) == []
        assert len(evaluate(rule("temp_min", "lte", "2"), forecast, NOW)) == 1

    def test_minimum_above_threshold_with_gt(self):
        # Every hour is 15 °C or more: the minimum of each day is 15.
        triggers = evaluate(rule("temp_min", "gt", "14"), payload(), NOW)

        assert [(t.target_date, t.value) for t in triggers] == [(TODAY, 15.0), (TOMORROW, 15.0)]

    def test_maximum_above_threshold_today(self):
        forecast = payload({"2026-11-03T17:00": {"temperature_c": 36.0}})

        [trigger] = evaluate(rule("temp_max", "gt", "35"), forecast, NOW)

        assert (trigger.target_date, trigger.value) == (TODAY, 36.0)
        assert trigger.at == "2026-11-03T17:00:00-03:00"
        assert trigger.title == "Máxima de 36 °C hoy en Lote Norte"
        assert "Máxima mayor a 35 °C en Lote Norte" in trigger.body

    def test_gte_includes_and_gt_excludes_the_threshold(self):
        forecast = payload({"2026-11-03T17:00": {"temperature_c": 35.0}})

        assert evaluate(rule("temp_max", "gt", "35"), forecast, NOW) == []
        assert len(evaluate(rule("temp_max", "gte", "35"), forecast, NOW)) == 1

    def test_past_hours_of_today_are_ignored(self):
        # 15:00 is the current hour in the list, but it is already past at 15:20.
        forecast = payload({"2026-11-03T15:00": {"temperature_c": -5.0}})

        assert evaluate(rule("temp_min", "lt", "2"), forecast, NOW) == []

    def test_the_day_after_tomorrow_is_ignored(self):
        forecast = payload({"2026-11-05T05:00": {"temperature_c": -5.0}})

        assert evaluate(rule("temp_min", "lt", "2"), forecast, NOW) == []

    def test_missing_values_are_skipped(self):
        forecast = payload({"2026-11-04T05:00": {"temperature_c": None}})

        assert evaluate(rule("temp_min", "lt", "16"), forecast, NOW) != []
        assert evaluate(rule("temp_min", "lt", "2"), forecast, NOW) == []


class TestWind:
    def test_maximum_wind_and_gust_in_the_body(self):
        forecast = payload({"2026-11-04T14:00": {"wind_kmh": 45.0, "gust_kmh": 70.0}})

        [trigger] = evaluate(rule("wind", "gt", "40"), forecast, NOW)

        assert (trigger.target_date, trigger.value) == (TOMORROW, 45.0)
        assert trigger.at == "2026-11-04T14:00:00-03:00"
        assert trigger.title == "Viento de 45 km/h mañana en Lote Norte"
        assert "Viento mayor a 40 km/h en Lote Norte" in trigger.body
        assert "ráfagas de hasta 70 km/h" in trigger.body

    def test_calm_days_do_not_trigger(self):
        assert evaluate(rule("wind", "gte", "40"), payload(), NOW) == []


class TestRain:
    def test_today_sums_only_the_hours_still_to_come(self):
        forecast = payload(
            {
                "2026-11-03T15:00": {"rain_mm": 10.0},  # past
                "2026-11-03T16:00": {"rain_mm": 2.0},
                "2026-11-03T18:00": {"rain_mm": 3.5},
            },
            daily_rain={TODAY: 15.5},
        )

        [trigger] = evaluate(rule("rain", "gt", "5"), forecast, NOW)

        assert (trigger.target_date, trigger.value, trigger.at) == (TODAY, 5.5, None)
        assert trigger.title == "Lluvia de 5,5 mm hoy en Lote Norte"
        assert "Lluvia mayor a 5 mm en el día en Lote Norte" in trigger.body

    def test_tomorrow_uses_the_daily_total(self):
        forecast = payload(daily_rain={TOMORROW: 12.0})

        [trigger] = evaluate(rule("rain", "gte", "12"), forecast, NOW)

        assert (trigger.target_date, trigger.value, trigger.at) == (TOMORROW, 12.0, None)
        assert trigger.title == "Lluvia de 12 mm mañana en Lote Norte"

    def test_the_day_after_tomorrow_is_ignored(self):
        forecast = payload(daily_rain={date(2026, 11, 5): 40.0})

        assert evaluate(rule("rain", "gt", "5"), forecast, NOW) == []


class TestFrost:
    def test_ground_frost_tonight(self):
        [trigger] = evaluate(rule("frost", "lte", "0"), payload(frost_c=-1.5), NOW)

        assert (trigger.target_date, trigger.value, trigger.at) == (TODAY, -1.5, None)
        assert trigger.title == "Helada en el suelo de -1,5 °C esta noche en Lote Norte"
        assert "Helada en el suelo de 0 °C o menos en Lote Norte" in trigger.body

    def test_warmer_ground_or_no_estimate_does_not_trigger(self):
        assert evaluate(rule("frost", "lt", "0"), payload(frost_c=0.0), NOW) == []
        assert evaluate(rule("frost", "lt", "0"), payload(frost_c=None), NOW) == []

    def test_before_dawn_the_night_in_progress_keeps_its_start_date(self):
        # 03:00 local: tonight's frost is the night that started yesterday at 20:00, so a
        # run in the evening and one before dawn share one (rule, day) and never duplicate.
        before_dawn = datetime(2026, 11, 4, 6, 0, tzinfo=UTC)

        [trigger] = evaluate(rule("frost", "lt", "0"), payload(frost_c=-2.0), before_dawn)

        assert trigger.target_date == TODAY


class TestSprayWindow:
    def test_best_window_today(self):
        forecast = payload(spray_window=("2026-11-03T17:00", "2026-11-03T19:00"))

        [trigger] = evaluate(rule("spray_window", None, None), forecast, NOW)

        assert trigger.target_date == TODAY
        assert trigger.at == "2026-11-03T17:00:00-03:00"
        assert trigger.value == 2.0  # hours
        assert trigger.title == "Ventana para pulverizar hoy en Lote Norte"
        assert "de 17:00 a 19:00" in trigger.body

    def test_no_window_does_not_trigger(self):
        assert evaluate(rule("spray_window", None, None), payload(), NOW) == []


def test_long_lote_names_keep_the_title_within_the_column():
    # The longest title (frost) plus an 80-character lote name exceeds the 120 of the column.
    lote = "N" * 80

    [trigger] = evaluate(rule("frost", "lt", "0", lote), payload(frost_c=-10.5), NOW)

    assert len(trigger.title) == 120
    assert trigger.title.startswith("Helada en el suelo de -10,5 °C esta noche en NNN")
    assert trigger.title.endswith("…")
