"""Every threshold of the decisions engine, in one place.

Each value cites its section of Doc/reglas-agronomicas.md and its evidence tag:
[V] verified in the cited source, [S] secondary source, [I] team inference to
calibrate with backtesting. Callers can pass a different `Thresholds` (for
example, stricter limits for a province) instead of editing these defaults.
"""

from dataclasses import dataclass

ENGINE_VERSION = "v0"

# --- §1 Helada ---------------------------------------------------------------
# "Decisión: usar ≤ 0 °C" (INTA and FAO definitions) [V].
FROST_GROUND_C = 0.0
# "Tmin_suelo = Tmin_2m − Δ": Δ 4 °C on radiative nights, 0.5 °C otherwise [I].
GROUND_DELTA_RADIATIVE_C = 4.0
GROUND_DELTA_OTHER_C = 0.5
# Radiative night: wind_speed_10m < 10 km/h and cloud_cover_low < 25 % [I].
RADIATIVE_MAX_WIND_KMH = 10.0
RADIATIVE_MAX_LOW_CLOUD_PCT = 25.0
# Caution margin above frost for the ground estimate. Assumption, no source [I].
FROST_CAUTION_GROUND_C = 2.0

# --- §2 Pulverización ----------------------------------------------------------
# Delta T: green 2 to 8, yellow < 2 or 8 to 10, red > 10 (GRDC) [V].
DELTA_T_MIN = 2.0
DELTA_T_MAX = 8.0
DELTA_T_RED_ABOVE = 10.0
# Wind at 2 m: u2 = 0.75 · u10 (FAO-56, eq. 47) [V].
WIND_2M_FACTOR = 0.75
# Wind at 2 m: green 5 to 15, yellow 3 to 5 or 15 to 20, red < 3 or > 20 (APVMA, GRDC) [V].
WIND_2M_MIN = 5.0
WIND_2M_MAX = 15.0
WIND_2M_RED_BELOW = 3.0
WIND_2M_RED_ABOVE = 20.0
# Gust at 2 m: green ≤ 20, yellow 20 to 28, red > 28 [I]. The same 0.75 factor is applied.
GUST_2M_MAX = 20.0
GUST_2M_RED_ABOVE = 28.0
# Temperature: green ≤ 28, yellow 28 to 30, red > 30 [I].
SPRAY_TEMP_MAX_C = 28.0
SPRAY_TEMP_RED_ABOVE_C = 30.0
# Inversion: night or the first hour after sunrise, cloud_cover < 30 % and
# wind at 10 m < 10 km/h; temperature_80m − temperature_2m > 0 confirms it [I].
INVERSION_MAX_CLOUD_PCT = 30.0
INVERSION_MAX_WIND_10M_KMH = 10.0
INVERSION_HOURS_AFTER_SUNRISE = 1
# Rain-free window: 6 h is the default for glyphosate, hormonal and systemic
# products [V/I]; rain ≥ 0.5 mm inside it is red [I].
RAIN_WASH_HOURS = 6
RAIN_WASH_MM = 0.5
# Wet leaf: rain ≥ 1 mm in the previous 2 h, or T − Td < 2 °C, is yellow [I].
WET_LEAF_RAIN_MM = 1.0
WET_LEAF_HOURS = 2
WET_LEAF_DEW_SPREAD_C = 2.0
# A window of at least this many green hours is "good". Assumption, no source [I].
SPRAY_MIN_WINDOW_HOURS = 2

# --- §3 Labores ------------------------------------------------------------------
# Assumption, no source [I]: a day with ≥ 5 mm keeps the field from being
# workable. §3 says INTA gives no number of drying days; reports will calibrate it.
HEAVY_RAIN_MM = 5.0
# Probability from which the next heavy rain is critical. Assumption, no source [I].
FIELD_CRITICAL_PROBABILITY_PCT = 70.0

# --- Rain probability (S4) and the daily sky label -----------------------------
# A member "rains" in a period with ≥ 1 mm (S4) [I].
RAIN_PROBABILITY_MM = 1.0
# Sky label: ≥ 1 mm in the day is "lluvia"; mean daytime cloud cover < 30 % is
# "sol", < 70 % "parcial", else "nublado". Assumption, no source [I].
SKY_RAIN_MM = 1.0
SKY_SUNNY_MAX_CLOUD_PCT = 30.0
SKY_PARTLY_MAX_CLOUD_PCT = 70.0
SKY_DAY_HOURS = (7, 19)  # local hours averaged for the daytime cloud cover
# One hour's sky (the animated background): ≥ 0.2 mm in the hour is "lluvia",
# twice the 0.1 mm resolution of the models, so a trace is not painted as rain.
# Assumption, no source [I].
SKY_RAIN_HOUR_MM = 0.2
THUNDER_WEATHER_CODES = frozenset({95, 96, 99})  # WMO codes for thunderstorm


@dataclass(frozen=True)
class Thresholds:
    frost_ground_c: float = FROST_GROUND_C
    ground_delta_radiative_c: float = GROUND_DELTA_RADIATIVE_C
    ground_delta_other_c: float = GROUND_DELTA_OTHER_C
    radiative_max_wind_kmh: float = RADIATIVE_MAX_WIND_KMH
    radiative_max_low_cloud_pct: float = RADIATIVE_MAX_LOW_CLOUD_PCT
    frost_caution_ground_c: float = FROST_CAUTION_GROUND_C
    delta_t_min: float = DELTA_T_MIN
    delta_t_max: float = DELTA_T_MAX
    delta_t_red_above: float = DELTA_T_RED_ABOVE
    wind_2m_factor: float = WIND_2M_FACTOR
    wind_2m_min: float = WIND_2M_MIN
    wind_2m_max: float = WIND_2M_MAX
    wind_2m_red_below: float = WIND_2M_RED_BELOW
    wind_2m_red_above: float = WIND_2M_RED_ABOVE
    gust_2m_max: float = GUST_2M_MAX
    gust_2m_red_above: float = GUST_2M_RED_ABOVE
    spray_temp_max_c: float = SPRAY_TEMP_MAX_C
    spray_temp_red_above_c: float = SPRAY_TEMP_RED_ABOVE_C
    inversion_max_cloud_pct: float = INVERSION_MAX_CLOUD_PCT
    inversion_max_wind_10m_kmh: float = INVERSION_MAX_WIND_10M_KMH
    inversion_hours_after_sunrise: int = INVERSION_HOURS_AFTER_SUNRISE
    rain_wash_hours: int = RAIN_WASH_HOURS
    rain_wash_mm: float = RAIN_WASH_MM
    wet_leaf_rain_mm: float = WET_LEAF_RAIN_MM
    wet_leaf_hours: int = WET_LEAF_HOURS
    wet_leaf_dew_spread_c: float = WET_LEAF_DEW_SPREAD_C
    spray_min_window_hours: int = SPRAY_MIN_WINDOW_HOURS
    heavy_rain_mm: float = HEAVY_RAIN_MM
    field_critical_probability_pct: float = FIELD_CRITICAL_PROBABILITY_PCT
    rain_probability_mm: float = RAIN_PROBABILITY_MM
    sky_rain_mm: float = SKY_RAIN_MM
    sky_sunny_max_cloud_pct: float = SKY_SUNNY_MAX_CLOUD_PCT
    sky_partly_max_cloud_pct: float = SKY_PARTLY_MAX_CLOUD_PCT


DEFAULT = Thresholds()
