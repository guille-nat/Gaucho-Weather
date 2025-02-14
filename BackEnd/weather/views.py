from django.utils.dateparse import parse_datetime
from django.core.cache import cache
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
import requests
import os
import math
from dotenv import load_dotenv

load_dotenv()

TOMORROW_API_KEY = os.getenv("TOMORROW_API_KEY")


def calculate_frost_probability(data) -> int:
    """
    Calcula la probabilidad de que haya una helada.
        Arguments:
            temp_min = data.get("temperatureMin", 999)  # Si no hay dato, asumimos un valor alto
            temp_apparent = data.get("temperatureApparentAvg", 999)
            dew_point = data.get("dewPoint", 999)
            humidity = data.get("humidityAvg", 0)
            cloud_cover = data.get("cloudCover", 100)
            freezing_rain = data.get("freezingRainIntensityAvg", 0)
            sleet_intensity = data.get("sleetIntensity", 0)
        return 
    """
    temp_min = data.get(
        "temperatureMin", 999)  # Si no hay dato, asumimos un valor alto
    temp_apparent = data.get("temperatureApparentAvg", 999)
    dew_point = data.get("dewPoint", 999)
    humidity = data.get("humidityAvg", 0)
    cloud_cover = data.get("cloudCover", 100)
    freezing_rain = data.get("freezingRainIntensityAvg", 0)
    sleet_intensity = data.get("sleetIntensity", 0)

    probabilidad = 0

    # 1. Temperatura baja (peso fuerte)
    if temp_min <= 0:
        probabilidad += 50
    elif temp_min <= 3:
        probabilidad += 30
    elif temp_min <= 5:
        probabilidad += 10

    # 2. Punto de rocío bajo y humedad alta
    if temp_min <= 2 and dew_point <= 0 and humidity >= 85:
        probabilidad += 20

    # 3. Lluvia congelada o aguanieve
    if freezing_rain > 0 or sleet_intensity > 0:
        probabilidad += 25

    # 4. Poca nubosidad
    if cloud_cover < 30:
        probabilidad += 15

    # La probabilidad no puede superar 100%
    return min(probabilidad, 100)


@api_view(["GET"])
def get_weather(request, lat: str, lon: str):
    try:
        cache_key = f"weather_{lat}_{lon}"
        cached_data = cache.get(cache_key)

        if cached_data:
            # Devolvemos los datos cacheados en lugar de llamar a la API
            return cached_data
        api_url = f"https://api.tomorrow.io/v4/weather/forecast?location={lat},{lon}&apikey={TOMORROW_API_KEY}"

        # Petición a la API
        response = requests.get(api_url)
        data = response.json()

        # Extraer el pronóstico minutely (cada minuto)
        # Primer elemento.
        weather_minutely_data = data["timelines"]["minutely"][0]
        values_minutely = weather_minutely_data["values"]

        weather_daily_data = data["timelines"]["daily"][0]
        values_daily = weather_daily_data["values"]

        data_calculate_frost_probability = {
            "temperatureMin": values_daily["temperatureMin"],
            "temperatureApparentAvg": values_daily["temperatureApparentAvg"],
            "dewPoint": values_minutely["dewPoint"],
            "humidityAvg": values_daily["humidityAvg"],
            "cloudCover": values_minutely["cloudCover"],
            "freezingRainIntensityAvg": values_daily["freezingRainIntensityAvg"],
            "sleetIntensity": values_minutely["sleetIntensity"]
        }
        frost_probability = calculate_frost_probability(
            data_calculate_frost_probability)

        return Response(
            {"a": data_calculate_frost_probability,
             "b": frost_probability},
            status=status.HTTP_200_OK
        )

    except Exception as e:
        return Response({"error": str(e)}, status=500)
