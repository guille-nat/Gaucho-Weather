"""Spray window today (S3): hourly green/yellow/red per Doc/reglas-agronomicas.md §2."""

from dataclasses import replace
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from engine import Hour, rate_spray_hour, spray_today, wet_bulb_stull, wind_2m

ART = ZoneInfo("America/Argentina/Buenos_Aires")
DAY = datetime(2026, 11, 3, tzinfo=ART)
SUNRISE = DAY.replace(hour=6, minute=10)
SUNSET = DAY.replace(hour=19, minute=50)
NOON = DAY.replace(hour=12)

# Delta T 5, wind at 2 m 10 km/h, gust at 2 m 15 km/h, 20 °C, half cloud, dry.
GOOD = Hour(
    time=NOON,
    temperature_c=20.0,
    wet_bulb_c=15.0,
    dew_point_c=10.0,
    wind_kmh=10 / 0.75,
    gust_kmh=20.0,
    cloud_cover_pct=50.0,
    precipitation_mm=0.0,
)


def day_of(hour=GOOD, **by_hour):
    """Hourly series 00:00 to 23:00 of DAY plus 12 h of the next day."""
    hours = []
    for i in range(36):
        time = DAY + timedelta(hours=i)
        hours.append(replace(by_hour.get(f"h{i}", hour), time=time))
    return hours


def rate(**changes):
    hours = day_of(h12=replace(GOOD, **changes))
    return rate_spray_hour(hours, 12, SUNRISE, SUNSET)


def test_wet_bulb_stull_matches_the_paper_example():
    # Stull (2011): 20 °C and 50 % relative humidity give 13.7 °C.
    assert wet_bulb_stull(20.0, 50.0) == pytest.approx(13.7, abs=0.05)


def test_wind_at_two_metres_is_three_quarters_of_ten_metres():
    assert wind_2m(20.0) == 15.0


def test_good_hour_is_green():
    assert rate().level == "ok"
    assert rate().causes == ()


@pytest.mark.parametrize(
    ("wet_bulb", "level"),
    [
        (18.5, "caution"),
        (18.0, "ok"),
        (12.0, "ok"),
        (11.0, "caution"),
        (10.0, "caution"),
        (9.5, "critical"),
    ],
    ids=["dt1.5", "dt2", "dt8", "dt9", "dt10", "dt10.5"],
)
def test_delta_t_bands(wet_bulb, level):
    assert rate(wet_bulb_c=wet_bulb).level == level


def test_delta_t_uses_stull_when_wet_bulb_is_missing():
    # 20 °C and 95 % humidity: Delta T well under 2.
    hour = rate(wet_bulb_c=None, humidity_pct=95.0)
    assert hour.level == "caution"
    assert "Delta T bajo" in hour.causes[0]


@pytest.mark.parametrize(
    ("wind_2m_kmh", "level"),
    [
        (2.0, "critical"),
        (4.0, "caution"),
        (5.0, "ok"),
        (15.0, "ok"),
        (18.0, "caution"),
        (21.0, "critical"),
    ],
)
def test_wind_at_two_metres_bands(wind_2m_kmh, level):
    # Gust kept equal to the wind so only the wind rule can fire.
    hour = rate(wind_kmh=wind_2m_kmh / 0.75, gust_kmh=wind_2m_kmh / 0.75)
    assert hour.level == level


@pytest.mark.parametrize(
    ("gust_2m_kmh", "level"), [(20.0, "ok"), (25.0, "caution"), (30.0, "critical")]
)
def test_gust_bands(gust_2m_kmh, level):
    assert rate(gust_kmh=gust_2m_kmh / 0.75).level == level


@pytest.mark.parametrize(("temp", "level"), [(28.0, "ok"), (29.0, "caution"), (31.0, "critical")])
def test_temperature_bands(temp, level):
    assert rate(temperature_c=temp, wet_bulb_c=temp - 5).level == level


def test_inversion_probable_first_hour_after_sunrise_clear_and_calm():
    calm_clear = replace(GOOD, cloud_cover_pct=10.0, wind_kmh=8.0, gust_kmh=8.0)  # u2 = 6
    hours = day_of(h7=calm_clear)

    hour = rate_spray_hour(hours, 7, SUNRISE, SUNSET)

    assert hour.level == "critical"
    assert hour.causes == ("inversión térmica probable",)


def test_inversion_doubtful_when_only_one_condition_holds_at_dawn():
    hours = day_of(h7=replace(GOOD, cloud_cover_pct=10.0))

    hour = rate_spray_hour(hours, 7, SUNRISE, SUNSET)

    assert hour.level == "caution"
    assert hour.causes == ("posible inversión térmica",)


def test_no_inversion_in_full_daylight_even_if_calm_and_clear():
    calm_clear = replace(GOOD, cloud_cover_pct=10.0, wind_kmh=8.0, gust_kmh=8.0)
    hours = day_of(h12=calm_clear)

    assert rate_spray_hour(hours, 12, SUNRISE, SUNSET).level == "ok"


def test_warmer_air_at_80_metres_confirms_an_inversion():
    assert rate(temperature_80m_c=21.0).causes == ("inversión térmica probable",)
    assert rate(temperature_80m_c=19.0).level == "ok"


def test_rain_within_the_wash_window_is_red():
    wet = replace(GOOD, precipitation_mm=0.6)
    assert rate_spray_hour(day_of(h15=wet), 12, SUNRISE, SUNSET).level == "critical"
    assert rate_spray_hour(day_of(h18=wet), 12, SUNRISE, SUNSET).level == "critical"
    # 7 h later is outside the default 6 h window.
    assert rate_spray_hour(day_of(h19=wet), 12, SUNRISE, SUNSET).level == "ok"
    light = replace(GOOD, precipitation_mm=0.4)
    assert rate_spray_hour(day_of(h15=light), 12, SUNRISE, SUNSET).level == "ok"


def test_wash_window_is_configurable():
    wet = replace(GOOD, precipitation_mm=0.6)
    hour = rate_spray_hour(day_of(h15=wet), 12, SUNRISE, SUNSET, wash_hours=2)
    assert hour.level == "ok"


def test_rain_in_the_previous_two_hours_is_yellow():
    hours = day_of(h11=replace(GOOD, precipitation_mm=1.2))
    assert rate_spray_hour(hours, 12, SUNRISE, SUNSET).causes == ("hoja mojada",)


def test_dew_is_yellow():
    assert rate(dew_point_c=18.5).causes == ("hoja mojada",)


def test_missing_wind_or_temperature_is_red():
    assert rate(wind_kmh=None).causes == ("faltan datos",)
    assert rate(temperature_c=None).level == "critical"


def test_worst_rule_wins():
    hour = rate(wet_bulb_c=18.5, temperature_c=20.0, gust_kmh=30 / 0.75)
    assert hour.level == "critical"


YELLOW = replace(GOOD, wet_bulb_c=11.0)  # Delta T 9


def test_best_window_is_the_longest_green_run_between_sunrise_and_sunset():
    green = {f"h{h}": GOOD for h in (9, 10, 11, 12, 14, 15)}
    hours = day_of(hour=YELLOW, **green)

    verdict = spray_today(hours, DAY.replace(hour=5), SUNRISE, SUNSET)

    assert verdict.level == "ok"
    assert verdict.best_window == (DAY.replace(hour=9), DAY.replace(hour=13))
    assert verdict.reason == "Buena ventana de 9 a 13 h."


def test_green_hours_at_night_do_not_count():
    hours = day_of(hour=YELLOW, h3=GOOD, h4=GOOD, h5=GOOD, h20=GOOD, h21=GOOD)

    verdict = spray_today(hours, DAY.replace(hour=1), SUNRISE, SUNSET)

    assert verdict.best_window is None


def test_past_hours_are_not_offered():
    green = {f"h{h}": GOOD for h in (9, 10, 11, 12)}
    hours = day_of(hour=YELLOW, **green)

    verdict = spray_today(hours, DAY.replace(hour=11, minute=30), SUNRISE, SUNSET)

    assert verdict.best_window == (DAY.replace(hour=11), DAY.replace(hour=13))


def test_short_window_is_caution():
    hours = day_of(hour=YELLOW, h10=GOOD)

    verdict = spray_today(hours, DAY.replace(hour=5), SUNRISE, SUNSET)

    assert verdict.level == "caution"
    assert verdict.best_window == (DAY.replace(hour=10), DAY.replace(hour=11))
    assert verdict.reason == "Ventana corta de 10 a 11 h; el resto del día, Delta T alto."


def test_only_yellow_hours_is_caution_without_window():
    verdict = spray_today(day_of(hour=YELLOW), DAY.replace(hour=5), SUNRISE, SUNSET)

    assert verdict.level == "caution"
    assert verdict.best_window is None
    assert verdict.reason == "Hoy no hay horas buenas para pulverizar: Delta T alto."


def test_all_red_is_critical():
    windy = replace(GOOD, wind_kmh=30 / 0.75, gust_kmh=40 / 0.75)

    verdict = spray_today(day_of(hour=windy), DAY.replace(hour=5), SUNRISE, SUNSET)

    assert verdict.level == "critical"
    assert verdict.best_window is None
    assert verdict.reason == "Hoy no conviene pulverizar: mucho viento."


def test_after_sunset_there_is_nothing_left_today():
    verdict = spray_today(day_of(), DAY.replace(hour=20), SUNRISE, SUNSET)

    assert verdict.level == "caution"
    assert verdict.best_window is None
    assert verdict.daylight_left is False
    assert verdict.reason == "Ya no quedan horas de luz para pulverizar hoy."


def test_without_sunrise_and_sunset_it_says_data_is_missing():
    verdict = spray_today(day_of(), DAY.replace(hour=9), None, None)

    assert verdict.level == "caution"
    assert verdict.best_window is None
    assert verdict.daylight_left is False
    assert verdict.reason == "Faltan datos para evaluar la pulverización de hoy."
