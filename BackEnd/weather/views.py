import logging
import os

from django.core.cache import cache
from dotenv import load_dotenv
from drf_yasg import openapi
from drf_yasg.utils import swagger_auto_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .utils import (
    LocationError,
    calculate_frost_probability,
    convert_data_location_lat_lon,
    fetch_weather_data,
    frost_risk_level,
    get_location_name,
)

logger = logging.getLogger(__name__)
load_dotenv()

TOMORROW_API_KEY = os.getenv("TOMORROW_API_KEY")
TOMORROW_BASE_URL = "https://api.tomorrow.io/v4/weather"

# El pronóstico cambia poco dentro de la hora; el dato actual, cada media hora.
FORECAST_TTL = 60 * 60
REALTIME_TTL = 60 * 30

LOCATION_PARAMS = [
    openapi.Parameter(
        "location",
        openapi.IN_QUERY,
        description="Nombre de la localización (usa '+' para espacios, ej: 'rosario+santa+fe+argentina').",
        type=openapi.TYPE_STRING,
    ),
    openapi.Parameter(
        "lat",
        openapi.IN_QUERY,
        description="Latitud de la ubicación.",
        type=openapi.TYPE_STRING,
    ),
    openapi.Parameter(
        "lon",
        openapi.IN_QUERY,
        description="Longitud de la ubicación.",
        type=openapi.TYPE_STRING,
    ),
    openapi.Parameter(
        "units",
        openapi.IN_QUERY,
        description='Puede ser "metric" o "imperial".',
        type=openapi.TYPE_STRING,
    ),
]


def _resolve_location(request):
    """
    Devuelve (location, units) o lanza LocationError.

    Centraliza la lectura de parámetros para que las tres vistas validen igual.
    """
    location = convert_data_location_lat_lon(request=request)
    units = request.query_params.get("units", "metric")
    return location, units


def _tomorrow_url(endpoint, location, units):
    url = f"{TOMORROW_BASE_URL}/{endpoint}?location={location}&apikey={TOMORROW_API_KEY}"
    if units:
        url += f"&units={units}"
    return url


def _fetch_forecast(location, units):
    """
    Pronóstico diario y horario, con caché en Redis.

    El cacheo es explícito y por vista: la clave incluye ubicación y unidades,
    y solo se guardan datos públicos (nunca respuestas por usuario).
    """
    cache_key = f"weather_forecast:{location}:{units}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    data = fetch_weather_data(_tomorrow_url("forecast", location, units), {})
    if not data:
        return None

    weather_location_data = data["location"]
    weather_location_data["name"] = get_location_name(
        lat=weather_location_data["lat"], lon=weather_location_data["lon"]
    )

    response_data = {
        "weather_daily_data": data["timelines"]["daily"],
        "weather_hourly_data": data["timelines"]["hourly"],
        "weather_location_data": weather_location_data,
    }
    cache.set(cache_key, response_data, timeout=FORECAST_TTL)
    return response_data


@swagger_auto_schema(
    method="get",
    operation_description="Obtiene el clima actual y el de los próximos 6 días para una ubicación específica.",
    manual_parameters=LOCATION_PARAMS,
    responses={
        200: "Pronóstico diario y horario más los datos de la ubicación.",
        400: "Parámetros inválidos",
        502: "La API de clima no respondió",
    },
)
@api_view(["GET"])
@permission_classes([AllowAny])
def get_weather_now_to_six_days(request):
    """
    Retorna el tiempo de los próximos 6 días y sus respectivas horas.
    Puede recibir 'location' (nombre de la localización, con '+' para espacios)
    o 'lat' y 'lon' (latitud y longitud).
    ej:
    weathers-days/?location=rosario+santa+fe+argentina
    weathers-days/?lat=-32.47&lon=-61.57
    """
    try:
        location, units = _resolve_location(request)
    except LocationError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    response_data = _fetch_forecast(location, units)
    if response_data is None:
        # 502 y no 500: el que falló fue el proveedor, no esta aplicación.
        return Response(
            {"error": "Failed to fetch weather data"},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    return Response(response_data, status=status.HTTP_200_OK)


@swagger_auto_schema(
    method="get",
    operation_description="Obtiene el clima actual para una ubicación específica.",
    manual_parameters=LOCATION_PARAMS,
    responses={
        200: "Condiciones actuales y datos de la ubicación.",
        400: "Parámetros inválidos",
        502: "La API de clima no respondió",
    },
)
@api_view(["GET"])
@permission_classes([AllowAny])
def get_weather_now(request):
    """
    Retorna el tiempo actual.
    Puede recibir 'location' (nombre de la localización, con '+' para espacios)
    o 'lat' y 'lon' (latitud y longitud).
    ej:
    weathers-now/?location=rosario+santa+fe+argentina
    weathers-now/?lat=-32.47&lon=-61.57
    """
    try:
        location, units = _resolve_location(request)
    except LocationError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    cache_key = f"weather_now:{location}:{units}"
    cached_data = cache.get(cache_key)
    if cached_data:
        return Response(cached_data, status=status.HTTP_200_OK)

    headers = {"accept": "application/json", "accept-encoding": "deflate, gzip, br"}
    data = fetch_weather_data(_tomorrow_url("realtime", location, units), headers)

    if not data:
        return Response(
            {"error": "Failed to fetch weather data"},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    data["location"]["name"] = get_location_name(
        lat=data["location"]["lat"], lon=data["location"]["lon"]
    )
    cache.set(cache_key, data, timeout=REALTIME_TTL)

    return Response(data, status=status.HTTP_200_OK)


@swagger_auto_schema(
    method="get",
    operation_description=(
        "Probabilidad de helada para los próximos días en una ubicación. "
        "Devuelve, por día, la probabilidad de 0 a 100, el nivel de riesgo "
        "(none/low/moderate/high/severe) y la temperatura mínima prevista."
    ),
    manual_parameters=LOCATION_PARAMS,
    responses={
        200: "Riesgo de helada por día.",
        400: "Parámetros inválidos",
        502: "La API de clima no respondió",
    },
)
@api_view(["GET"])
@permission_classes([AllowAny])
def get_frost_risk(request):
    """
    Retorna el riesgo de helada por día para los próximos 6 días.

    Es el dato que diferencia al producto: una helada arruina una cosecha, y
    saberlo con 48 horas permite reaccionar.

    ej:
    frost-risk/?location=rosario+santa+fe+argentina
    frost-risk/?lat=-32.47&lon=-61.57
    """
    try:
        location, units = _resolve_location(request)
    except LocationError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    # Reutiliza la misma caché que el pronóstico: no gasta un request extra
    # contra Tomorrow.io, que se factura por llamada.
    forecast = _fetch_forecast(location, units)
    if forecast is None:
        return Response(
            {"error": "Failed to fetch weather data"},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    days = []
    for day in forecast["weather_daily_data"]:
        values = day.get("values", {})
        probability = calculate_frost_probability(values)
        days.append(
            {
                "date": day.get("time"),
                "probability": probability,
                "risk_level": frost_risk_level(probability),
                "temperature_min": values.get("temperatureMin"),
                "dew_point": values.get("dewPointAvg"),
                "humidity": values.get("humidityAvg"),
                "cloud_cover": values.get("cloudCoverAvg"),
            }
        )

    return Response(
        {
            "location": forecast["weather_location_data"],
            "units": units,
            "days": days,
        },
        status=status.HTTP_200_OK,
    )
