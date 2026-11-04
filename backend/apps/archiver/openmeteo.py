"""Open-Meteo client: one request per grid cell, model and kind.

Variable names follow Doc/reglas-agronomicas.md (section 7). A variable a model
does not provide comes back as nulls, so one list per kind is enough.
"""

import httpx
from django.conf import settings

from .cells import Cell

TIMEZONE = "America/Argentina/Buenos_Aires"
FORECAST_DAYS = 7

DETERMINISTIC_MODELS = ("ecmwf_ifs025", "gfs_seamless", "icon_seamless")
ENSEMBLE_MODELS = ("ecmwf_ifs025", "gfs025")

DETERMINISTIC_HOURLY = (
    "temperature_2m",
    "temperature_80m",
    "temperature_120m",
    "relative_humidity_2m",
    "dew_point_2m",
    "wet_bulb_temperature_2m",
    "surface_temperature",
    "precipitation",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "cloud_cover",
    "cloud_cover_low",
    "soil_temperature_0cm",
    "soil_temperature_6cm",
    "soil_temperature_0_to_10cm",
    "soil_moisture_0_to_1cm",
    "soil_moisture_1_to_3cm",
    "soil_moisture_3_to_9cm",
    "soil_moisture_0_to_7cm",
    "soil_moisture_0_to_10cm",
    "et0_fao_evapotranspiration",
    "vapour_pressure_deficit",
)

# Ensembles have no upper-air temperatures (see the rules doc), and every
# variable multiplies by the member count, so the list is shorter.
ENSEMBLE_HOURLY = (
    "temperature_2m",
    "relative_humidity_2m",
    "dew_point_2m",
    "precipitation",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "cloud_cover",
    "surface_temperature",
    "soil_temperature_0_to_7cm",
    "soil_temperature_0_to_10cm",
    "soil_moisture_0_to_7cm",
    "soil_moisture_0_to_10cm",
    "et0_fao_evapotranspiration",
    "vapour_pressure_deficit",
)

DETERMINISTIC = "deterministic"
ENSEMBLE = "ensemble"

JOBS: tuple[tuple[str, str], ...] = tuple(
    [(DETERMINISTIC, model) for model in DETERMINISTIC_MODELS]
    + [(ENSEMBLE, model) for model in ENSEMBLE_MODELS]
)


def build_request(kind: str, model: str, cell: Cell) -> tuple[str, dict[str, str]]:
    if kind == DETERMINISTIC:
        url, variables = settings.OPEN_METEO_FORECAST_URL, DETERMINISTIC_HOURLY
    else:
        url, variables = settings.OPEN_METEO_ENSEMBLE_URL, ENSEMBLE_HOURLY
    params = {
        "latitude": str(cell[0]),
        "longitude": str(cell[1]),
        "hourly": ",".join(variables),
        "models": model,
        "timezone": TIMEZONE,
        "forecast_days": str(FORECAST_DAYS),
    }
    if settings.OPEN_METEO_API_KEY:
        params["apikey"] = settings.OPEN_METEO_API_KEY
    return url, params


def fetch(client: httpx.Client, kind: str, model: str, cell: Cell) -> dict:
    """Return the decoded JSON. Raises httpx.HTTPError or ValueError on failure."""
    url, params = build_request(kind, model, cell)
    response = client.get(url, params=params)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict) or "hourly" not in payload:
        raise ValueError(f"Unexpected Open-Meteo response: {str(payload)[:200]}")
    return payload
