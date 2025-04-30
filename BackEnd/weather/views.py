from django.core.cache import cache  # Importación de cache para usar Redis
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi
import os
from dotenv import load_dotenv
import hashlib
import json
from .utils import (
    fetch_weather_data,
    convert_data_location_lat_lon,
    get_location_name,
)
import logging

# Configuración del logger
logger = logging.getLogger(__name__)
load_dotenv()

TOMORROW_API_KEY = os.getenv("TOMORROW_API_KEY")


@swagger_auto_schema(
    method="get",
    operation_description="Obtiene el clima actual y el de los próximos 5 días para una ubicación específica.",
    manual_parameters=[
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
            description='Puede ser "metric" o "imperial"',
            type=openapi.TYPE_STRING,
        ),
    ],
    responses={
        200: openapi.Response(
            description="Datos del clima.",
            examples={
                "weather_daily_data": [
                    {
                        "time": "2025-02-22T09:00:00Z",
                        "values": {
                            "cloudBaseAvg": 2.4,
                            "cloudBaseMax": 11.4,
                            "cloudBaseMin": 0,
                            "cloudCeilingAvg": 1.7,
                            "cloudCeilingMax": 11.7,
                            "cloudCeilingMin": 0,
                            "cloudCoverAvg": 25,
                            "cloudCoverMax": 100,
                            "cloudCoverMin": 0,
                            "dewPointAvg": 20.4,
                            "dewPointMax": 21.9,
                            "dewPointMin": 18.8,
                            "evapotranspirationAvg": 0.235,
                            "evapotranspirationMax": 0.808,
                            "evapotranspirationMin": 0.016,
                            "evapotranspirationSum": 5.63,
                            "freezingRainIntensityAvg": 0,
                            "freezingRainIntensityMax": 0,
                            "freezingRainIntensityMin": 0,
                            "hailProbabilityAvg": 54.8,
                            "hailProbabilityMax": 92.4,
                            "hailProbabilityMin": 2.5,
                            "hailSizeAvg": 4.58,
                            "hailSizeMax": 9.45,
                            "hailSizeMin": 0.35,
                            "humidityAvg": 48,
                            "humidityMax": 76,
                            "humidityMin": 29,
                            "iceAccumulationAvg": 0,
                            "iceAccumulationLweAvg": 0,
                            "iceAccumulationLweMax": 0,
                            "iceAccumulationLweMin": 0,
                            "iceAccumulationLweSum": 0,
                            "iceAccumulationMax": 0,
                            "iceAccumulationMin": 0,
                            "iceAccumulationSum": 0,
                            "moonriseTime": "2025-02-22T03:49:36Z",
                            "moonsetTime": "2025-02-22T19:09:51Z",
                            "precipitationProbabilityAvg": 0,
                            "precipitationProbabilityMax": 0,
                            "precipitationProbabilityMin": 0,
                            "pressureSeaLevelAvg": 1011,
                            "pressureSeaLevelMax": 1013,
                            "pressureSeaLevelMin": 1009,
                            "pressureSurfaceLevelAvg": 1009,
                            "pressureSurfaceLevelMax": 1011,
                            "pressureSurfaceLevelMin": 1008,
                            "rainAccumulationAvg": 0.01,
                            "rainAccumulationLweAvg": 0.01,
                            "rainAccumulationLweMax": 0.18,
                            "rainAccumulationLweMin": 0,
                            "rainAccumulationMax": 0.19,
                            "rainAccumulationMin": 0,
                            "rainAccumulationSum": 0.19,
                            "rainIntensityAvg": 0,
                            "rainIntensityMax": 0,
                            "rainIntensityMin": 0,
                            "sleetAccumulationAvg": 0,
                            "sleetAccumulationLweAvg": 0,
                            "sleetAccumulationLweMax": 0,
                            "sleetAccumulationLweMin": 0,
                            "sleetAccumulationLweSum": 0,
                            "sleetAccumulationMax": 0,
                            "sleetAccumulationMin": 0,
                            "sleetIntensityAvg": 0,
                            "sleetIntensityMax": 0,
                            "sleetIntensityMin": 0,
                            "snowAccumulationAvg": 0,
                            "snowAccumulationLweAvg": 0,
                            "snowAccumulationLweMax": 0,
                            "snowAccumulationLweMin": 0,
                            "snowAccumulationLweSum": 0,
                            "snowAccumulationMax": 0,
                            "snowAccumulationMin": 0,
                            "snowAccumulationSum": 0,
                            "snowIntensityAvg": 0,
                            "snowIntensityMax": 0,
                            "snowIntensityMin": 0,
                            "sunriseTime": "2025-02-22T09:46:00Z",
                            "sunsetTime": "2025-02-22T22:45:00Z",
                            "temperatureApparentAvg": 36.3,
                            "temperatureApparentMax": 42.7,
                            "temperatureApparentMin": 26.6,
                            "temperatureAvg": 33.7,
                            "temperatureMax": 40,
                            "temperatureMin": 26.6,
                            "uvHealthConcernAvg": 1,
                            "uvHealthConcernMax": 3,
                            "uvHealthConcernMin": 0,
                            "uvIndexAvg": 2,
                            "uvIndexMax": 10,
                            "uvIndexMin": 0,
                            "visibilityAvg": 15.32,
                            "visibilityMax": 16,
                            "visibilityMin": 11.02,
                            "weatherCodeMax": 1100,
                            "weatherCodeMin": 1100,
                            "windDirectionAvg": 69,
                            "windGustAvg": 9.4,
                            "windGustMax": 14.3,
                            "windGustMin": 5.6,
                            "windSpeedAvg": 3.6,
                            "windSpeedMax": 5.4,
                            "windSpeedMin": 1.6,
                        },
                    }
                ],
                "weather_hourly_data": [
                    {
                        "time": "2025-02-22T15:00:00Z",
                        "values": {
                            "cloudBase": 2.2,
                            "cloudCeiling": "null",
                            "cloudCover": 25,
                            "dewPoint": 19.9,
                            "evapotranspiration": 0.209,
                            "freezingRainIntensity": 0,
                            "hailProbability": 16.6,
                            "hailSize": 6.7,
                            "humidity": 36,
                            "iceAccumulation": 0,
                            "iceAccumulationLwe": 0,
                            "precipitationProbability": 0,
                            "pressureSeaLevel": 1013,
                            "pressureSurfaceLevel": 1010,
                            "rainAccumulation": 0,
                            "rainAccumulationLwe": 0,
                            "rainIntensity": 0,
                            "sleetAccumulation": 0,
                            "sleetAccumulationLwe": 0,
                            "sleetIntensity": 0,
                            "snowAccumulation": 0,
                            "snowAccumulationLwe": 0,
                            "snowIntensity": 0,
                            "temperature": 37.2,
                            "temperatureApparent": 40.1,
                            "uvHealthConcern": 3,
                            "uvIndex": 8,
                            "visibility": 14.31,
                            "weatherCode": 1100,
                            "windDirection": 12,
                            "windGust": 5.9,
                            "windSpeed": 3.9,
                        },
                    },
                    {
                        "time": "2025-02-22T16:00:00Z",
                        "values": {
                            "cloudBase": 1.9,
                            "cloudCeiling": "null",
                            "cloudCover": 23,
                            "dewPoint": 19.6,
                            "evapotranspiration": 0.795,
                            "freezingRainIntensity": 0,
                            "hailProbability": 24.2,
                            "hailSize": 6.79,
                            "humidity": 34,
                            "iceAccumulation": 0,
                            "iceAccumulationLwe": 0,
                            "precipitationProbability": 0,
                            "pressureSeaLevel": 1012,
                            "pressureSurfaceLevel": 1011,
                            "rainAccumulation": 0,
                            "rainAccumulationLwe": 0,
                            "rainIntensity": 0,
                            "sleetAccumulation": 0,
                            "sleetAccumulationLwe": 0,
                            "sleetIntensity": 0,
                            "snowAccumulation": 0,
                            "snowAccumulationLwe": 0,
                            "snowIntensity": 0,
                            "temperature": 38.4,
                            "temperatureApparent": 41.6,
                            "uvHealthConcern": 3,
                            "uvIndex": 10,
                            "visibility": 16,
                            "weatherCode": 1100,
                            "windDirection": 343,
                            "windGust": 5.6,
                            "windSpeed": 3.9,
                        },
                    },
                ],
            },
        ),
        400: "Parámetros inválidos",
        500: "Error interno del servidor",
    },
)
@api_view(["GET"])
@permission_classes([AllowAny])
def get_weather_now_to_six_days(request):
    """
    Retorna el tiempo de los próximos 6 días y sus respectivas horas.
    Puede recibir 'location' (nombre de la localización, con '+' para espacios) o 'lat' y 'lon' (latitud y longitud).
    ej:
    weathers-days/?location=rosario+santa+fe+argentina
    weathers-days/?lat=-32.47&lon=-61.57
    """

    try:
        # Obtener los datos de la localización (nombre o lat/lon)
        name_location = convert_data_location_lat_lon(request=request)
        units = request.query_params.get("units", "metric")

        # Crear una clave única para Redis basada en los parámetros
        cache_key = f"weather_forecast:{name_location}:{units}"

        # Intentar obtener datos desde Redis
        cached_data = cache.get(cache_key)
        if cached_data:
            # Si encontramos datos en caché, los devolvemos directamente
            return Response(cached_data, status=status.HTTP_200_OK)

        headers = {}
        api_url = f"https://api.tomorrow.io/v4/weather/forecast?location={name_location}&apikey={TOMORROW_API_KEY}"
        if units:
            api_url += f"&units={units}"

        # Petición a la API
        data = fetch_weather_data(api_url, headers)

        if data:
            # Extraer datos del pronóstico (diario y por hora)
            weather_daily_data = data["timelines"]["daily"]
            weather_hourly_data = data["timelines"]["hourly"]
            weather_location_data = data["location"]
            weather_location_data["name"] = get_location_name(
                lat=weather_location_data["lat"], lon=weather_location_data["lon"]
            )

            # Preparar respuesta
            response_data = {
                "weather_daily_data": weather_daily_data,
                "weather_hourly_data": weather_hourly_data,
                "weather_location_data": weather_location_data,
            }

            # Guardar en caché (1 horas para pronóstico)
            # 60 segundos * 60 = 3600 segundos = 1 horas
            cache.set(cache_key, response_data, timeout=3600)

            return Response(response_data, status=status.HTTP_200_OK)
        else:
            # Si la API falla, guardar el error en caché (1 hora)
            error_response = {"error": "Failed to fetch weather data"}
            error_cache_key = f"weather_forecast_error:{name_location}:{units}"
            # 60 segundos * 60 = 3600 segundos = 1 hora
            cache.set(error_cache_key, error_response, timeout=3600)

            return Response(
                error_response, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    except Exception as e:
        logger.error(f"Error al obtener datos del clima: {str(e)}")
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@swagger_auto_schema(
    method="get",
    operation_description="Obtiene el clima actual para una ubicación específica.",
    manual_parameters=[
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
            description='Puede ser "metric" o "imperial"',
            type=openapi.TYPE_STRING,
        ),
    ],
    responses={
        200: openapi.Response(
            description="Datos del clima actual.",
            examples={
                "now": {
                    "data": {
                        "time": "2025-02-22T15:19:00Z",
                        "values": {
                            "cloudBase": 2.3,
                            "cloudCeiling": "null",
                            "cloudCover": 24,
                            "dewPoint": 19.8,
                            "freezingRainIntensity": 0,
                            "hailProbability": 37.4,
                            "hailSize": 9.79,
                            "humidity": 36,
                            "precipitationProbability": 0,
                            "pressureSeaLevel": 1012,
                            "pressureSurfaceLevel": 1010,
                            "rainIntensity": 0,
                            "sleetIntensity": 0,
                            "snowIntensity": 0,
                            "temperature": 37.5,
                            "temperatureApparent": 40.7,
                            "uvHealthConcern": 3,
                            "uvIndex": 8,
                            "visibility": 14.31,
                            "weatherCode": 1100,
                            "windDirection": 13,
                            "windGust": 5.8,
                            "windSpeed": 3.9,
                        },
                    },
                    "location": {
                        "lat": -32.9593620300293,
                        "lon": -60.66170120239258,
                        "name": "Municipio de Rosario, Gran Rosario, Departamento Rosario, Santa Fe, S2000, Argentina",
                        "type": "administrative",
                    },
                }
            },
        ),
        400: "Parámetros inválidos",
        500: "Error interno del servidor",
    },
)
@api_view(["GET"])
@permission_classes([AllowAny])
def get_weather_now(request):
    """
    Retorna el tiempo actual.
    Puede recibir 'location' (nombre de la localización, con '+' para espacios) o 'lat' y 'lon' (latitud y longitud).
    ej:
    weathers-now/?location=rosario+santa+fe+argentina
    weathers-now/?lat=-32.47&lon=-61.57
    """
    try:
        # Obtener los datos de la localización (nombre o lat/lon)
        name_location = convert_data_location_lat_lon(request=request)
        units = request.query_params.get("units", "metric")

        # Crear una clave única para Redis basada en los parámetros
        cache_key = f"weather_now:{name_location}:{units}"

        # Intentar obtener datos desde Redis
        cached_data = cache.get(cache_key)
        if cached_data:
            # Si encontramos datos en caché, los devolvemos directamente
            return Response(cached_data, status=status.HTTP_200_OK)

        # Si no hay datos en caché, hacer la llamada a la API
        headers = {"accept": "application/json", "accept-encoding": "deflate, gzip, br"}
        api_url = f"https://api.tomorrow.io/v4/weather/realtime?location={name_location}&apikey={TOMORROW_API_KEY}"
        if units:
            api_url += f"&units={units}"

        data = fetch_weather_data(api_url, headers)

        if data:
            # Añadir nombre de ubicación
            data["location"]["name"] = get_location_name(
                lat=data["location"]["lat"], lon=data["location"]["lon"]
            )

            # Guardar en caché (30 minutos para datos actuales)
            # 60 segundos * 30 = 1800 segundos = 30 minutos
            cache.set(cache_key, data, timeout=1800)

            return Response(data, status=status.HTTP_200_OK)
        else:
            # Si la API falla, guardar el error en caché (1 hora) para evitar múltiples llamadas fallidas
            error_response = {"error": "Failed to fetch weather data"}
            error_cache_key = f"weather_error:{name_location}:{units}"
            # 60 segundos * 60 = 3600 segundos = 1 hora
            cache.set(error_cache_key, error_response, timeout=3600)

            return Response(
                error_response, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    except Exception as e:
        logger.error(f"Error al obtener datos del clima: {str(e)}")
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
