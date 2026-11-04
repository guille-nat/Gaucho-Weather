"""Frost tonight (S3): ground estimate Tmin_2m − Δ and agreement across models."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from engine import Hour, frost_tonight

ART = ZoneInfo("America/Argentina/Buenos_Aires")
START = datetime(2026, 11, 3, 20, tzinfo=ART)
END = datetime(2026, 11, 4, 8, tzinfo=ART)


def night(tmin, wind=5.0, low_cloud=10.0, cloud=10.0):
    """13 hourly values from 20:00 to 08:00 whose minimum is `tmin` at 05:00."""
    hours = []
    for i in range(13):
        time = START + timedelta(hours=i)
        temp = tmin if time.hour == 5 else tmin + 3
        hours.append(
            Hour(
                time=time,
                temperature_c=temp,
                wind_kmh=wind,
                cloud_cover_low_pct=low_cloud,
                cloud_cover_pct=cloud,
            )
        )
    return hours


def test_radiative_night_most_models_freeze_is_critical():
    models = {"a": night(1.5), "b": night(2.5), "c": night(5.0)}

    verdict = frost_tonight(models, START, END)

    assert verdict.level == "critical"
    assert verdict.min_2m_c == 2.5
    assert verdict.ground_estimate_c == -1.5  # median of −2.5, −1.5, 1.0 (Δ 4 °C)
    assert verdict.models_agreeing == "2 de 3 modelos"
    assert verdict.reason == (
        "Noche despejada y calma: en el suelo puede bajar a −1,5 °C. 2 de 3 modelos dan helada."
    )


def test_cloudy_windy_night_uses_small_delta():
    models = {"a": night(1.5, wind=20, low_cloud=90), "b": night(1.5, wind=20, low_cloud=90)}

    verdict = frost_tonight(models, START, END)

    assert verdict.ground_estimate_c == 1.0  # Δ 0.5 °C
    assert verdict.level == "caution"  # ground ≤ 2 °C
    assert verdict.models_agreeing == "0 de 2 modelos"
    assert verdict.reason == (
        "Noche nublada o con viento: en el suelo puede bajar a 1 °C. Ningún modelo da helada."
    )


def test_calm_but_overcast_night_is_not_radiative():
    verdict = frost_tonight({"a": night(3.0, wind=5, low_cloud=80)}, START, END)

    assert verdict.ground_estimate_c == 2.5
    assert verdict.level == "ok"


def test_one_model_freezing_is_caution():
    models = {"a": night(3.5), "b": night(8.0), "c": night(9.0)}

    verdict = frost_tonight(models, START, END)

    assert verdict.level == "caution"
    assert verdict.models_agreeing == "1 de 3 modelos"
    assert verdict.reason.endswith("1 de 3 modelos da helada.")


def test_warm_night_is_ok():
    verdict = frost_tonight({"a": night(8.0), "b": night(9.0)}, START, END)

    assert verdict.level == "ok"
    assert verdict.ground_estimate_c == 4.5


def test_hours_outside_the_window_are_ignored():
    hours = night(8.0) + [
        Hour(time=START - timedelta(hours=1), temperature_c=-6.0, wind_kmh=5),
        Hour(time=END + timedelta(hours=1), temperature_c=-6.0, wind_kmh=5),
    ]

    verdict = frost_tonight({"a": hours}, START, END)

    assert verdict.min_2m_c == 8.0
    assert verdict.level == "ok"


def test_missing_low_cloud_falls_back_to_total_cloud_cover():
    verdict = frost_tonight({"a": night(3.0, low_cloud=None, cloud=90)}, START, END)

    assert verdict.ground_estimate_c == 2.5  # not radiative: total cover 90 %


def test_models_without_night_data_do_not_count():
    verdict = frost_tonight({"a": night(1.0), "b": []}, START, END)

    assert verdict.models_agreeing == "1 de 1 modelos"
    assert verdict.level == "critical"


def test_no_data_is_caution_with_an_honest_reason():
    verdict = frost_tonight({"a": []}, START, END)

    assert verdict.level == "caution"
    assert verdict.min_2m_c is None
    assert verdict.ground_estimate_c is None
    assert verdict.models_agreeing == "0 de 0 modelos"
    assert verdict.reason == "Sin datos de temperatura para esta noche."
