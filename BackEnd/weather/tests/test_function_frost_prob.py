from django.test import TestCase
from ..utils import calculate_frost_probability


class CalculateFrostProbability(TestCase):
    def setUp(self):
        """
        Crear datos para la prueba
        """
        self.data = {
            "temperatureMin": -1.5,
            "temperatureApparentAvg": -2.0,
            "dewPoint": -3.0,
            "humidityAvg": 90,
            "cloudCover": 20,
            "freezingRainIntensityAvg": 0,
            "sleetIntensity": 0,
        }
        self.low_value = 85
        self.upper_value = 100

    def test_calculate_frost_probability(self):
        frost_probability = calculate_frost_probability(self.data)
        self.assertGreaterEqual(
            frost_probability,
            self.low_value,
            msg="El valor debe ser mayor o igual a 85",
        )
        self.assertLessEqual(
            frost_probability,
            self.upper_value,
            msg="El valor debe ser menor o igual a 100",
        )
        print(frost_probability)
