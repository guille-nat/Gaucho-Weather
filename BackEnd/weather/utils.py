from rest_framework.response import Response
from rest_framework import status
import requests
import re
import logging
from dotenv import load_dotenv
import os


load_dotenv()
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
logger = logging.getLogger(__name__)


def get_location_name(lat: float, lon: float):
    """
    Retorna el nombre de la ubicación a partir de latitud y longitud usando la API de Google Geocoding.
    """
    url = "https://maps.googleapis.com/maps/api/geocode/json"

    params = {"latlng": f"{lat},{lon}", "key": GOOGLE_MAPS_API_KEY}

    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()

        if data["status"] == "OK":
            # Tomo la dirección formateada (nombre completo)
            formatted_address = data["results"][0]["formatted_address"]
            return formatted_address
        else:
            return f"Error en la respuesta de Google: {data['status']}"
    except requests.exceptions.RequestException as e:
        return f"Error al conectar con la API: {str(e)}"


def calculate_frost_probability(data: dict) -> int:
    """
    Calcula la probabilidad de que haya una helada.
        Arguments:
            # Si no hay dato, asumimos un valor alto
            temp_min = data.get("temperatureMin", 999)
            temp_apparent = data.get("temperatureApparentAvg", 999)
            dew_point = data.get("dewPoint", 999)
            humidity = data.get("humidityAvg", 0)
            cloud_cover = data.get("cloudCover", 100)
            freezing_rain = data.get("freezingRainIntensityAvg", 0)
            sleet_intensity = data.get("sleetIntensity", 0)
        return
    """
    try:
        temp_min = data.get(
            "temperatureMin", 999
        )  # Si no hay dato, asumimos un valor alto
        dew_point = data.get("dewPoint", 999)
        humidity = data.get("humidityAvg", 0)
        cloud_cover = data.get("cloudCover", 100)
        freezing_rain = data.get("freezingRainIntensityAvg", 0)
        sleet_intensity = data.get("sleetIntensity", 0)

        probability = 0

        # 1. Temperatura baja (peso fuerte)
        if temp_min <= 0:
            probability += 50
        elif temp_min <= 3:
            probability += 30
        elif temp_min <= 5:
            probability += 10

        # 2. Punto de rocío bajo y humedad alta
        if temp_min <= 2 and dew_point <= 0 and humidity >= 85:
            probability += 20

        # 3. Lluvia congelada o aguanieve
        if freezing_rain > 0 or sleet_intensity > 0:
            probability += 25

        # 4. Poca nubosidad
        if cloud_cover < 30:
            probability += 15

        # La probabilidad no puede superar 100%
        return min(probability, 100)
    except Exception as e:
        return Response({"error": e}, status=status.HTTP_404_NOT_FOUND)


def fetch_weather_data(api_url, headers):
    """
    Realiza la petición al endpoint de la URL, retorna la data del endpoint.

        api_url (str): URL del endpoint de terceros.
        headers (dict): Diccionario con las cabeceras del endpoint.
    """
    try:
        response = requests.get(api_url, headers=headers, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching weather data: {e}")
        return None


def convert_data_location_lat_lon(request):
    """
    Convierte los datos de ubicación a una cadena legible para el endpoint.

    request (HttpRequest): request del endpoint.
    """
    try:
        location = request.GET.get("location")
        lat = request.GET.get("lat")
        lon = request.GET.get("lon")
        units = request.GET.get("units")
        add_units = ""
        if units:
            if not "metric" or not "imperial":
                return {"error": 'units invalid, please select "metric" or "imperial"'}
            add_units = f"&units={units}"
        if location:
            if not re.search(r"[a-zA-Z]", location):
                return {"error": "Location invalid"}
            location.replace("+", "%20")
            return location + add_units
        elif lat and lon:
            if not (
                re.match(r"^-?\d+(\.\d+)?$", lat) and re.match(r"^-?\d+(\.\d+)?$", lon)
            ):
                return {"error": "Invalid lat or lon"}
            return f"{lat}%2C{lon}{add_units}"
        return {"error": "Provide either location or lat and lon"}
    except Exception as e:
        return Response({"error": e}, status=status.HTTP_404_NOT_FOUND)
