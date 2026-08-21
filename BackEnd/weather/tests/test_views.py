"""Tests de los endpoints de clima. La API externa va mockeada."""

from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

FORECAST_FIXTURE = {
    "location": {"lat": -32.47, "lon": -61.57, "type": "administrative"},
    "timelines": {
        "daily": [
            {
                "time": "2026-08-01T09:00:00Z",
                "values": {
                    "temperatureMin": -2.0,
                    "dewPoint": -4.0,
                    "dewPointAvg": -4.0,
                    "humidityAvg": 90,
                    "cloudCover": 10,
                    "cloudCoverAvg": 10,
                    "freezingRainIntensityAvg": 0,
                    "sleetIntensity": 0,
                },
            },
            {
                "time": "2026-08-02T09:00:00Z",
                "values": {
                    "temperatureMin": 18.0,
                    "dewPoint": 12.0,
                    "dewPointAvg": 12.0,
                    "humidityAvg": 55,
                    "cloudCover": 60,
                    "cloudCoverAvg": 60,
                },
            },
        ],
        "hourly": [{"time": "2026-08-01T10:00:00Z", "values": {"temperature": 1.0}}],
    },
}


class FrostRiskEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse("frost-risk")
        cache.clear()

    def tearDown(self):
        cache.clear()

    @patch("weather.views.get_location_name", return_value="Las Rosas, Santa Fe")
    @patch("weather.views.fetch_weather_data", return_value=FORECAST_FIXTURE)
    def test_devuelve_riesgo_por_dia(self, mock_fetch, mock_name):
        respuesta = self.client.get(self.url, {"lat": "-32.47", "lon": "-61.57"})
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)

        dias = respuesta.data["days"]
        self.assertEqual(len(dias), 2)

        # Noche muy fría, seca y despejada: riesgo severo.
        self.assertEqual(dias[0]["risk_level"], "severe")
        self.assertGreaterEqual(dias[0]["probability"], 70)

        # Día templado: sin riesgo.
        self.assertEqual(dias[1]["risk_level"], "none")
        self.assertEqual(dias[1]["probability"], 0)

    @patch("weather.views.get_location_name", return_value="Las Rosas")
    @patch("weather.views.fetch_weather_data", return_value=FORECAST_FIXTURE)
    def test_es_publico(self, mock_fetch, mock_name):
        # Sin autenticar: el pronóstico es información pública.
        respuesta = APIClient().get(self.url, {"lat": "-32.47", "lon": "-61.57"})
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)

    def test_parametros_invalidos_dan_400(self):
        respuesta = self.client.get(self.url, {"lat": "abc", "lon": "def"})
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_sin_parametros_da_400(self):
        # Antes esto seguía adelante con un dict de error como si fuera
        # una ubicación válida.
        self.assertEqual(
            self.client.get(self.url).status_code, status.HTTP_400_BAD_REQUEST
        )

    def test_unidades_invalidas_dan_400(self):
        respuesta = self.client.get(
            self.url, {"lat": "-32.47", "lon": "-61.57", "units": "kelvin"}
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("weather.views.fetch_weather_data", return_value=None)
    def test_fallo_del_proveedor_da_502(self, mock_fetch):
        # 502 y no 500: el que falló fue Tomorrow.io, no esta aplicación.
        respuesta = self.client.get(self.url, {"lat": "-32.47", "lon": "-61.57"})
        self.assertEqual(respuesta.status_code, status.HTTP_502_BAD_GATEWAY)

    @patch("weather.views.get_location_name", return_value="Las Rosas")
    @patch("weather.views.fetch_weather_data", return_value=FORECAST_FIXTURE)
    def test_la_segunda_llamada_sale_de_cache(self, mock_fetch, mock_name):
        self.client.get(self.url, {"lat": "-32.47", "lon": "-61.57"})
        self.client.get(self.url, {"lat": "-32.47", "lon": "-61.57"})
        # Tomorrow.io factura por request: la segunda no debe salir a la red.
        self.assertEqual(mock_fetch.call_count, 1)

    @patch("weather.views.get_location_name", return_value="Las Rosas")
    @patch("weather.views.fetch_weather_data", return_value=FORECAST_FIXTURE)
    def test_el_pronostico_comparte_cache_con_el_riesgo(self, mock_fetch, mock_name):
        self.client.get(reverse("weather_6days"), {"lat": "-32.47", "lon": "-61.57"})
        self.client.get(self.url, {"lat": "-32.47", "lon": "-61.57"})
        self.assertEqual(mock_fetch.call_count, 1)


class WeatherEndpointsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        cache.clear()

    def tearDown(self):
        cache.clear()

    @patch("weather.views.get_location_name", return_value="Las Rosas")
    @patch("weather.views.fetch_weather_data", return_value=FORECAST_FIXTURE)
    def test_pronostico_seis_dias(self, mock_fetch, mock_name):
        respuesta = self.client.get(
            reverse("weather_6days"), {"lat": "-32.47", "lon": "-61.57"}
        )
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertIn("weather_daily_data", respuesta.data)
        self.assertIn("weather_hourly_data", respuesta.data)
        self.assertEqual(
            respuesta.data["weather_location_data"]["name"], "Las Rosas"
        )

    @patch("weather.views.get_location_name", return_value="Las Rosas")
    @patch(
        "weather.views.fetch_weather_data",
        return_value={
            "data": {"values": {"temperature": 1.0}},
            "location": {"lat": -32.47, "lon": -61.57},
        },
    )
    def test_clima_actual(self, mock_fetch, mock_name):
        respuesta = self.client.get(
            reverse("weather-now"), {"lat": "-32.47", "lon": "-61.57"}
        )
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertEqual(respuesta.data["location"]["name"], "Las Rosas")


class HealthEndpointTests(TestCase):
    def test_healthz_no_requiere_autenticacion(self):
        respuesta = APIClient().get(reverse("healthz"))
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertEqual(respuesta.data["status"], "ok")

    def test_readyz_reporta_las_dependencias(self):
        respuesta = APIClient().get(reverse("readyz"))
        self.assertIn(respuesta.status_code, (200, 503))
        self.assertIn("database", respuesta.data["checks"])
        self.assertIn("cache", respuesta.data["checks"])
