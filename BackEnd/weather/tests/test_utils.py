"""Tests de las utilidades de clima. No tocan la red: todo va mockeado."""

from unittest.mock import patch

import requests
from django.test import RequestFactory, TestCase

from ..utils import (
    LocationError,
    calculate_frost_probability,
    convert_data_location_lat_lon,
    frost_risk_level,
    get_location_name,
)


class CalculateFrostProbabilityTests(TestCase):
    def test_noche_fria_despejada_da_riesgo_alto(self):
        data = {
            "temperatureMin": -1.5,
            "dewPoint": -3.0,
            "humidityAvg": 90,
            "cloudCover": 20,
            "freezingRainIntensityAvg": 0,
            "sleetIntensity": 0,
        }
        self.assertEqual(calculate_frost_probability(data), 85)

    def test_dia_calido_da_cero(self):
        data = {
            "temperatureMin": 22,
            "dewPoint": 15,
            "humidityAvg": 40,
            "cloudCover": 5,
        }
        # Cielo despejado con 22 °C no es una helada: el bonus por poca
        # nubosidad solo cuenta si además hace frío.
        self.assertEqual(calculate_frost_probability(data), 0)

    def test_nunca_supera_cien(self):
        data = {
            "temperatureMin": -10,
            "dewPoint": -12,
            "humidityAvg": 95,
            "cloudCover": 0,
            "freezingRainIntensityAvg": 2,
            "sleetIntensity": 1,
        }
        self.assertEqual(calculate_frost_probability(data), 100)

    def test_datos_faltantes_no_inventan_alerta(self):
        # Sin datos no se alerta: los defaults tienen que ser conservadores.
        self.assertEqual(calculate_frost_probability({}), 0)

    def test_valores_no_numericos_no_rompen(self):
        data = {"temperatureMin": None, "dewPoint": "n/a", "humidityAvg": ""}
        self.assertEqual(calculate_frost_probability(data), 0)

    def test_niveles_de_riesgo(self):
        self.assertEqual(frost_risk_level(0), "none")
        self.assertEqual(frost_risk_level(15), "low")
        self.assertEqual(frost_risk_level(35), "moderate")
        self.assertEqual(frost_risk_level(55), "high")
        self.assertEqual(frost_risk_level(85), "severe")


class ConvertDataLocationTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def _request(self, **params):
        return self.factory.get("/api/weather/weathers-now/", params)

    def test_location_por_nombre(self):
        result = convert_data_location_lat_lon(self._request(location="rosario"))
        self.assertEqual(result, "rosario")

    def test_lat_lon_valida(self):
        result = convert_data_location_lat_lon(self._request(lat="-32.47", lon="-61.57"))
        self.assertEqual(result, "-32.47%2C-61.57")

    def test_unidades_invalidas_son_rechazadas(self):
        # El chequeo viejo (`if not "metric" or not "imperial"`) era siempre
        # falso y dejaba pasar cualquier valor.
        with self.assertRaises(LocationError):
            convert_data_location_lat_lon(self._request(location="rosario", units="kelvin"))

    def test_unidades_validas_se_agregan(self):
        result = convert_data_location_lat_lon(
            self._request(location="rosario", units="imperial")
        )
        self.assertEqual(result, "rosario&units=imperial")

    def test_lat_fuera_de_rango(self):
        with self.assertRaises(LocationError):
            convert_data_location_lat_lon(self._request(lat="200", lon="0"))

    def test_lat_lon_no_numericos(self):
        with self.assertRaises(LocationError):
            convert_data_location_lat_lon(self._request(lat="abc", lon="def"))

    def test_sin_parametros(self):
        with self.assertRaises(LocationError):
            convert_data_location_lat_lon(self._request())

    def test_location_sin_letras(self):
        with self.assertRaises(LocationError):
            convert_data_location_lat_lon(self._request(location="12345"))


class GetLocationNameTests(TestCase):
    @patch("weather.utils.GOOGLE_MAPS_API_KEY", "fake-key")
    @patch("weather.utils.requests.get")
    def test_devuelve_direccion_formateada(self, mock_get):
        mock_get.return_value.raise_for_status.return_value = None
        mock_get.return_value.json.return_value = {
            "status": "OK",
            "results": [{"formatted_address": "Las Rosas, Santa Fe, Argentina"}],
        }
        self.assertEqual(
            get_location_name(-32.47, -61.57), "Las Rosas, Santa Fe, Argentina"
        )

    @patch("weather.utils.GOOGLE_MAPS_API_KEY", "fake-key")
    @patch("weather.utils.requests.get")
    def test_error_de_red_devuelve_none(self, mock_get):
        mock_get.side_effect = requests.exceptions.RequestException("timeout")
        # Antes devolvía el texto del error, que terminaba mostrándose al
        # usuario como si fuera el nombre de su localidad.
        self.assertIsNone(get_location_name(-32.47, -61.57))

    @patch("weather.utils.GOOGLE_MAPS_API_KEY", "fake-key")
    @patch("weather.utils.requests.get")
    def test_status_no_ok_devuelve_none(self, mock_get):
        mock_get.return_value.raise_for_status.return_value = None
        mock_get.return_value.json.return_value = {"status": "ZERO_RESULTS"}
        self.assertIsNone(get_location_name(0, 0))

    @patch("weather.utils.GOOGLE_MAPS_API_KEY", "")
    def test_sin_api_key_devuelve_none(self):
        self.assertIsNone(get_location_name(-32.47, -61.57))
