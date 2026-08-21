"""
Revisa el pronóstico de las ubicaciones favoritas y avisa por correo cuando hay
riesgo de helada.

Pensado para correr por cron una o dos veces al día:

    docker compose exec backend python manage.py send_frost_alerts

El comando es idempotente: `FrostAlert` guarda usuario + localidad + día, así
que volver a correrlo no reenvía el mismo aviso.
"""

import logging
from datetime import datetime

from django.core.management.base import BaseCommand
from django.db import IntegrityError

from users.emails import send_frost_alert_email
from users.models import CustomUser, FrostAlert
from weather.utils import calculate_frost_probability, fetch_weather_data
from weather.views import _tomorrow_url

logger = logging.getLogger(__name__)

DEFAULT_THRESHOLD = 50


class Command(BaseCommand):
    help = "Envía alertas de helada a los usuarios que las tengan activadas."

    def add_arguments(self, parser):
        parser.add_argument(
            "--threshold",
            type=int,
            default=DEFAULT_THRESHOLD,
            help=f"Probabilidad mínima para avisar (0-100). Por defecto {DEFAULT_THRESHOLD}.",
        )
        parser.add_argument(
            "--days",
            type=int,
            default=3,
            help="Cuántos días del pronóstico mirar. Por defecto 3.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Calcula y reporta sin enviar correos ni registrar alertas.",
        )

    def handle(self, *args, **options):
        threshold = options["threshold"]
        days_ahead = options["days"]
        dry_run = options["dry_run"]

        if not 0 <= threshold <= 100:
            self.stderr.write("El umbral debe estar entre 0 y 100.")
            return

        users = CustomUser.objects.filter(
            preferences__alerts_enabled=True,
            is_active=True,
            # Sin casilla verificada no mandamos nada: evita usar el sistema
            # para spamear direcciones ajenas.
            email_verify=True,
        ).select_related("preferences")

        checked = 0
        notified = 0

        for user in users:
            for location in user.preferences.favorite_location or []:
                if not isinstance(location, dict):
                    continue
                lat, lon = location.get("lat"), location.get("lon")
                name = location.get("name") or f"{lat},{lon}"
                if lat is None or lon is None:
                    continue

                checked += 1
                daily = self._fetch_daily(lat, lon)
                if daily is None:
                    self.stderr.write(f"No se pudo consultar el clima de {name}.")
                    continue

                for day in daily[:days_ahead]:
                    values = day.get("values", {})
                    probability = calculate_frost_probability(values)
                    if probability < threshold:
                        continue

                    forecast_date = self._parse_date(day.get("time"))
                    if forecast_date is None:
                        continue

                    payload = {
                        "location_name": name,
                        "forecast_date": forecast_date,
                        "probability": probability,
                        "min_temperature": values.get("temperatureMin"),
                    }

                    if dry_run:
                        self.stdout.write(
                            f"[dry-run] {user.username}: {name} {forecast_date} "
                            f"{probability}%"
                        )
                        notified += 1
                        continue

                    if self._record_and_send(user, lat, lon, payload):
                        notified += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Ubicaciones revisadas: {checked}. Alertas enviadas: {notified}."
            )
        )

    def _fetch_daily(self, lat, lon):
        location = f"{lat}%2C{lon}"
        data = fetch_weather_data(_tomorrow_url("forecast", location, "metric"), {})
        if not data:
            return None
        return data.get("timelines", {}).get("daily", [])

    @staticmethod
    def _parse_date(value):
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
        except ValueError:
            logger.warning("Fecha de pronóstico ilegible: %s", value)
            return None

    def _record_and_send(self, user, lat, lon, payload):
        """
        Registra primero y envía después.

        Si dos corridas se solapan, la restricción única hace fallar la segunda
        antes de mandar el correo, en lugar de duplicar el aviso.
        """
        try:
            FrostAlert.objects.create(
                user=user,
                location_name=payload["location_name"],
                latitude=lat,
                longitude=lon,
                forecast_date=payload["forecast_date"],
                probability=payload["probability"],
                min_temperature=payload["min_temperature"] or 0,
            )
        except IntegrityError:
            # Ya se avisó por esta localidad y este día.
            return False

        send_frost_alert_email(user, payload)
        return True
