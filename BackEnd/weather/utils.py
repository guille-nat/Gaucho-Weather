import logging
import os
import re

import requests
from dotenv import load_dotenv

load_dotenv()
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
logger = logging.getLogger(__name__)

VALID_UNITS = {"metric", "imperial"}


class LocationError(ValueError):
    """Los datos de ubicación recibidos no permiten armar una consulta."""


def get_location_name(lat: float, lon: float):
    """
    Retorna el nombre de la ubicación a partir de latitud y longitud usando la
    API de Google Geocoding.

    Ante cualquier fallo devuelve None en lugar de un texto de error: si
    devolviéramos el mensaje, terminaría mostrándose al usuario como si fuera
    el nombre de su localidad.
    """
    if not GOOGLE_MAPS_API_KEY:
        logger.warning("GOOGLE_MAPS_API_KEY no está configurada; no se geocodifica.")
        return None

    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {"latlng": f"{lat},{lon}", "key": GOOGLE_MAPS_API_KEY}

    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        if data.get("status") == "OK" and data.get("results"):
            return data["results"][0]["formatted_address"]

        logger.warning("Google Geocoding respondió %s", data.get("status"))
        return None
    except requests.exceptions.RequestException as exc:
        logger.error("Error al conectar con Google Geocoding: %s", exc)
        return None


def calculate_frost_probability(data: dict) -> int:
    """
    Calcula la probabilidad de que haya una helada, de 0 a 100.

        data (dict): valores diarios de Tomorrow.io. Se usan:
            temperatureMin, dewPoint, humidityAvg, cloudCover,
            freezingRainIntensityAvg, sleetIntensity.

    Los faltantes se completan con valores que NO suman probabilidad, para no
    inventar una alerta a partir de datos ausentes.
    """
    def number(key, default):
        value = data.get(key, default)
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    temp_min = number("temperatureMin", 999)
    dew_point = number("dewPoint", 999)
    humidity = number("humidityAvg", 0)
    cloud_cover = number("cloudCover", 100)
    freezing_rain = number("freezingRainIntensityAvg", 0)
    sleet_intensity = number("sleetIntensity", 0)

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

    # 4. Poca nubosidad: sin nubes el suelo irradia calor y se enfría más.
    #    Solo cuenta si ya hace frío; con 25 °C y cielo despejado no hay helada.
    if cloud_cover < 30 and temp_min <= 5:
        probability += 15

    # La probabilidad no puede superar 100%
    return min(probability, 100)


def frost_risk_level(probability: int) -> str:
    """Traduce la probabilidad a una categoría para la interfaz y las alertas."""
    if probability >= 70:
        return "severe"
    if probability >= 50:
        return "high"
    if probability >= 30:
        return "moderate"
    if probability >= 10:
        return "low"
    return "none"


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
    except requests.exceptions.RequestException as exc:
        logger.error("Error fetching weather data: %s", exc)
        return None


def convert_data_location_lat_lon(request):
    """
    Convierte los datos de ubicación del request a la cadena que espera
    Tomorrow.io.

        request (HttpRequest): request del endpoint.

    Lanza LocationError si los parámetros no sirven. Antes devolvía un dict de
    error que la vista usaba igual como si fuera una ubicación válida.
    """
    location = request.GET.get("location")
    lat = request.GET.get("lat")
    lon = request.GET.get("lon")
    units = request.GET.get("units")

    add_units = ""
    if units:
        # El chequeo anterior era `if not "metric" or not "imperial"`, que
        # evalúa cadenas no vacías: siempre falso, nunca validaba nada.
        if units not in VALID_UNITS:
            raise LocationError('units invalid, please select "metric" or "imperial"')
        add_units = f"&units={units}"

    if location:
        if not re.search(r"[a-zA-Z]", location):
            raise LocationError("Location invalid")
        # str.replace no muta: hay que reasignar el resultado.
        normalized = location.replace("+", "%20")
        return normalized + add_units

    if lat and lon:
        if not (
            re.match(r"^-?\d+(\.\d+)?$", lat) and re.match(r"^-?\d+(\.\d+)?$", lon)
        ):
            raise LocationError("Invalid lat or lon")
        if not -90 <= float(lat) <= 90 or not -180 <= float(lon) <= 180:
            raise LocationError("lat or lon out of range")
        return f"{lat}%2C{lon}{add_units}"

    raise LocationError("Provide either location or lat and lon")
