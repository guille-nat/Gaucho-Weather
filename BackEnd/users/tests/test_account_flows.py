"""Verificación de correo, recupero de contraseña y alertas de helada."""

from datetime import date

from django.core import mail
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from users.emails import build_email_verification_token, send_verification_email
from users.models import CustomUser, FrostAlert, UserPreferences


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_URL="https://gauchoweather.test",
)
class EmailVerificationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = CustomUser.objects.create_user(
            username="ana", email="ana@example.com", password="clave-larga-123"
        )
        UserPreferences.objects.get_or_create(user=self.user)

    def test_el_registro_dispara_el_correo(self):
        mail.outbox.clear()
        self.client.post(
            reverse("register-user"),
            {
                "username": "nuevo",
                "email": "nuevo@example.com",
                "password": "clave-bien-larga-99",
                "first_name": "Nuevo",
                "last_name": "Usuario",
            },
            format="json",
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("verify-email?token=", mail.outbox[0].body)

    def test_token_valido_verifica_la_cuenta(self):
        token = build_email_verification_token(self.user)
        respuesta = self.client.post(
            reverse("verify-email"), {"token": token}, format="json"
        )
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.email_verify)

    def test_token_manipulado_es_rechazado(self):
        respuesta = self.client.post(
            reverse("verify-email"), {"token": "no-es-un-token"}, format="json"
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertFalse(self.user.email_verify)

    def test_cambiar_el_email_invalida_la_verificacion(self):
        self.user.email_verify = True
        self.user.save(update_fields=["email_verify"])

        self.client.force_authenticate(user=self.user)
        mail.outbox.clear()
        respuesta = self.client.patch(
            reverse("update-user"), {"email": "otra@example.com"}, format="json"
        )
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertFalse(
            self.user.email_verify,
            msg="Cambiar el correo tiene que exigir verificar el nuevo.",
        )
        self.assertEqual(len(mail.outbox), 1)

    def test_smtp_caido_no_rompe_el_registro(self):
        with override_settings(
            EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
            EMAIL_HOST="127.0.0.1",
            EMAIL_PORT=1,
        ):
            # La cuenta ya está creada: un fallo de correo no debe revertirla.
            self.assertFalse(send_verification_email(self.user))


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_URL="https://gauchoweather.test",
)
class PasswordResetTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = CustomUser.objects.create_user(
            username="ana", email="ana@example.com", password="clave-original-123"
        )
        UserPreferences.objects.get_or_create(user=self.user)
        mail.outbox.clear()

    def _pedir_reset(self, email):
        return self.client.post(
            reverse("password-reset-request"), {"email": email}, format="json"
        )

    def _extraer_uid_y_token(self):
        cuerpo = mail.outbox[0].body
        query = cuerpo.split("reset-password?")[1].split()[0]
        partes = dict(par.split("=") for par in query.split("&"))
        return partes["uid"], partes["token"]

    def test_pedido_valido_envia_correo(self):
        respuesta = self._pedir_reset("ana@example.com")
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)

    def test_email_inexistente_responde_igual(self):
        """
        No se puede distinguir una cuenta existente de una que no: si no,
        el endpoint sirve para enumerar qué correos están registrados.
        """
        respuesta_conocida = self._pedir_reset("ana@example.com")
        mail.outbox.clear()
        respuesta_desconocida = self._pedir_reset("nadie@example.com")

        self.assertEqual(
            respuesta_conocida.status_code, respuesta_desconocida.status_code
        )
        self.assertEqual(respuesta_conocida.data, respuesta_desconocida.data)
        self.assertEqual(len(mail.outbox), 0)

    def test_flujo_completo_cambia_la_contrasena(self):
        self._pedir_reset("ana@example.com")
        uid, token = self._extraer_uid_y_token()

        respuesta = self.client.post(
            reverse("password-reset-confirm"),
            {"uid": uid, "token": token, "new_password": "clave-nueva-segura-456"},
            format="json",
        )
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("clave-nueva-segura-456"))

    def test_el_token_no_se_puede_reusar(self):
        self._pedir_reset("ana@example.com")
        uid, token = self._extraer_uid_y_token()
        payload = {"uid": uid, "token": token, "new_password": "clave-nueva-segura-456"}

        self.client.post(reverse("password-reset-confirm"), payload, format="json")
        segunda = self.client.post(
            reverse("password-reset-confirm"),
            dict(payload, new_password="otra-clave-distinta-789"),
            format="json",
        )
        self.assertEqual(segunda.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("clave-nueva-segura-456"))

    def test_token_invalido_es_rechazado(self):
        self._pedir_reset("ana@example.com")
        uid, _ = self._extraer_uid_y_token()
        respuesta = self.client.post(
            reverse("password-reset-confirm"),
            {"uid": uid, "token": "token-falso", "new_password": "clave-nueva-456"},
            format="json",
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)

    def test_password_nueva_debe_pasar_los_validadores(self):
        self._pedir_reset("ana@example.com")
        uid, token = self._extraer_uid_y_token()
        respuesta = self.client.post(
            reverse("password-reset-confirm"),
            {"uid": uid, "token": token, "new_password": "1"},
            format="json",
        )
        self.assertEqual(respuesta.status_code, status.HTTP_400_BAD_REQUEST)


class FrostAlertModelTests(TestCase):
    def setUp(self):
        self.user = CustomUser.objects.create_user(
            username="ana", email="ana@example.com", password="clave-larga-123"
        )

    def _crear(self, **extra):
        datos = {
            "user": self.user,
            "location_name": "Las Rosas",
            "latitude": -32.47,
            "longitude": -61.57,
            "forecast_date": date(2026, 8, 1),
            "probability": 80,
            "min_temperature": -2.0,
        }
        datos.update(extra)
        return FrostAlert.objects.create(**datos)

    def test_no_se_repite_la_alerta_para_el_mismo_dia(self):
        self._crear()
        with self.assertRaises(Exception):
            # La restricción única es lo que evita avisar dos veces por lo mismo.
            self._crear()

    def test_otro_dia_si_genera_alerta(self):
        self._crear()
        self._crear(forecast_date=date(2026, 8, 2))
        self.assertEqual(FrostAlert.objects.count(), 2)

    def test_listado_solo_muestra_las_propias(self):
        otro = CustomUser.objects.create_user(
            username="beto", email="beto@example.com", password="clave-larga-456"
        )
        self._crear()
        FrostAlert.objects.create(
            user=otro,
            location_name="Rosario",
            latitude=-32.95,
            longitude=-60.66,
            forecast_date=date(2026, 8, 1),
            probability=60,
            min_temperature=-1.0,
        )

        client = APIClient()
        client.force_authenticate(user=self.user)
        respuesta = client.get(reverse("frost-alerts"))
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertEqual(len(respuesta.data), 1)
        self.assertEqual(respuesta.data[0]["location_name"], "Las Rosas")
