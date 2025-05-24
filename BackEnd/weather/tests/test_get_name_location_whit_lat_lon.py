from django.test import TestCase
from ..utils import get_name_location_whit_lat_lon


class GetNameLocation(TestCase):
    def setUp(self):
        """
        Crear datos para la prueba
        """
        self.data = {
            "location": {
                "lat": -32.47549057006836,
                "lon": -61.57765197753906,
                "name": "Las Rosas, Departamento Belgrano, Santa Fe, S2520, Argentina",
                "type": "administrative",
            }
        }

    def test_get_with_lon_lat(self):
        name = get_name_location_whit_lat_lon(
            lat=self.data["location"]["lat"], lon=self.data["location"]["lon"]
        )
        self.assertEqual(
            name,
            "409, San Martín, Municipio de Las Rosas, Las Rosas, Departamento Belgrano, Santa Fe, S2520, Argentina",
        )


# TODO: HACER REVICION DE SALIDA PARA NOMBRE DE LOCALIDAD,
# TODO: HACER UN TEST EN DJANGO Y VER DATOS
