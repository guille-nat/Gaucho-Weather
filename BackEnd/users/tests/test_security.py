"""
Tests de regresión de los agujeros encontrados antes del pase a producción.

Cada uno documenta un fallo real. Si alguno se pone en rojo, volvió el bug.
"""

from django.conf import settings
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from users.models import CustomUser, UserPreferences


class ResponseCacheIsolationTests(TestCase):
    """
    El bug: config/base.py cargaba UpdateCacheMiddleware + FetchFromCacheMiddleware,
    que cachean toda respuesta GET con la URL como clave. Como la API autentica
    con JWT en el header Authorization (no con cookie), Django no agregaba
    'Vary: Cookie' y el perfil del primer usuario se le servía a cualquier otro.
    """

    def setUp(self):
        self.client = APIClient()
        self.ana = CustomUser.objects.create_user(
            username="ana", email="ana@example.com", password="clave-larga-ana-1"
        )
        self.beto = CustomUser.objects.create_user(
            username="beto", email="beto@example.com", password="clave-larga-beto-1"
        )
        UserPreferences.objects.get_or_create(user=self.ana)
        UserPreferences.objects.get_or_create(user=self.beto)

    def test_el_middleware_de_cache_no_esta_instalado(self):
        for middleware in (
            "django.middleware.cache.UpdateCacheMiddleware",
            "django.middleware.cache.FetchFromCacheMiddleware",
        ):
            self.assertNotIn(
                middleware,
                settings.MIDDLEWARE,
                msg=(
                    f"{middleware} cachea respuestas autenticadas por URL. "
                    "El cacheo va explícito en cada vista."
                ),
            )

    def test_cada_usuario_recibe_su_propio_perfil(self):
        url = reverse("users-profiles")

        self.client.force_authenticate(user=self.ana)
        respuesta_ana = self.client.get(url)
        self.assertEqual(respuesta_ana.status_code, status.HTTP_200_OK)
        self.assertEqual(respuesta_ana.data["user"]["username"], "ana")

        self.client.force_authenticate(user=self.beto)
        respuesta_beto = self.client.get(url)
        self.assertEqual(respuesta_beto.status_code, status.HTTP_200_OK)
        self.assertEqual(
            respuesta_beto.data["user"]["username"],
            "beto",
            msg="Beto recibió el perfil de otro usuario: volvió el bug de caché.",
        )

    def test_el_perfil_exige_autenticacion(self):
        self.assertEqual(
            APIClient().get(reverse("users-profiles")).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )


class PasswordHandlingTests(TestCase):
    """
    El bug: UserSerializer no sobreescribía update(), así que un PATCH con
    'password' hacía setattr(user, 'password', valor) y guardaba la contraseña
    EN TEXTO PLANO.
    """

    def setUp(self):
        self.client = APIClient()
        self.user = CustomUser.objects.create_user(
            username="ana", email="ana@example.com", password="clave-original-123"
        )
        UserPreferences.objects.get_or_create(user=self.user)
        self.client.force_authenticate(user=self.user)

    def test_patch_de_password_queda_hasheado(self):
        nueva = "clave-nueva-segura-456"
        respuesta = self.client.patch(
            reverse("update-user"), {"password": nueva}, format="json"
        )
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertNotEqual(
            self.user.password, nueva, msg="La contraseña quedó en texto plano."
        )
        self.assertTrue(self.user.check_password(nueva))

    def test_el_password_nunca_vuelve_en_la_respuesta(self):
        respuesta = self.client.get(reverse("users-profiles"))
        self.assertNotIn("password", respuesta.data["user"])


class RegistrationValidationTests(TestCase):
    """
    El bug: ModelSerializer no aplica AUTH_PASSWORD_VALIDATORS, así que la API
    aceptaba contraseñas de un caracter aunque el formulario pidiera ocho.
    """

    def setUp(self):
        self.client = APIClient()
        self.url = reverse("register-user")
        self.payload = {
            "username": "nuevo",
            "email": "nuevo@example.com",
            "password": "clave-bien-larga-99",
            "first_name": "Nuevo",
            "last_name": "Usuario",
        }

    def test_registro_valido(self):
        respuesta = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED)
        usuario = CustomUser.objects.get(username="nuevo")
        # Las preferencias se crean solas junto con la cuenta.
        self.assertTrue(hasattr(usuario, "preferences"))
        self.assertFalse(usuario.email_verify)

    def test_password_corta_es_rechazada(self):
        self.payload["password"] = "1"
        respuesta = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", respuesta.data)

    def test_password_solo_numerica_es_rechazada(self):
        self.payload["password"] = "12345678901"
        respuesta = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_email_duplicado_es_rechazado(self):
        self.client.post(self.url, self.payload, format="json")
        otro = dict(self.payload, username="otro")
        respuesta = self.client.post(self.url, otro, format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", respuesta.data)

    def test_username_duplicado_es_rechazado(self):
        self.client.post(self.url, self.payload, format="json")
        otro = dict(self.payload, email="otro@example.com")
        respuesta = self.client.post(self.url, otro, format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", respuesta.data)

    def test_username_y_email_se_normalizan_a_minusculas(self):
        payload = dict(self.payload, username="MAYUSCULA", email="MAY@Example.COM")
        self.client.post(self.url, payload, format="json")
        usuario = CustomUser.objects.get(username="mayuscula")
        self.assertEqual(usuario.email, "may@example.com")


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class PreferencesValidationTests(TestCase):
    """favorite_location es un JSONField libre: sin validar entraba cualquier cosa."""

    def setUp(self):
        self.client = APIClient()
        self.user = CustomUser.objects.create_user(
            username="ana", email="ana@example.com", password="clave-original-123"
        )
        UserPreferences.objects.get_or_create(user=self.user)
        self.client.force_authenticate(user=self.user)
        self.url = reverse("update-preferences")

    def test_ubicacion_valida(self):
        payload = {
            "favorite_location": [
                {"lat": -32.47, "lon": -61.57, "name": "Las Rosas"}
            ]
        }
        respuesta = self.client.patch(self.url, payload, format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)

    def test_ubicacion_sin_nombre_es_rechazada(self):
        payload = {"favorite_location": [{"lat": -32.47, "lon": -61.57}]}
        respuesta = self.client.patch(self.url, payload, format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_coordenadas_fuera_de_rango_son_rechazadas(self):
        payload = {
            "favorite_location": [{"lat": 999, "lon": -61.57, "name": "Marte"}]
        }
        respuesta = self.client.patch(self.url, payload, format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_estructura_que_no_es_lista_es_rechazada(self):
        respuesta = self.client.patch(
            self.url, {"favorite_location": {"lat": 1}}, format="json"
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
