from django.db import models
from django.contrib.auth.models import AbstractUser


class CustomUser(AbstractUser):
    # AbstractUser no exige que el email sea único, pero el recupero de
    # contraseña y la verificación de cuenta lo necesitan para identificar a
    # una única persona.
    email = models.EmailField("email address", unique=True)
    email_verify = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        # Normalizamos para que 'Juan' y 'juan' sean el mismo usuario.
        # No tocamos last_login: lo administra el login de Django. Escribirlo
        # en cada save convertía el campo en "última modificación".
        if self.username:
            self.username = self.username.lower()
        if self.email:
            self.email = self.email.lower()
        super().save(*args, **kwargs)


class UserPreferences(models.Model):
    """
    Modelo para almacenar las preferencias del usuario, como ubicaciones favoritas.
        Atributos:
            user (FK): Relaciona con el modelo User de django.
            favorite_location (JSON): Lista de coordenadas o nombres de las localidades
                                            ej: "favorite_location":[
                                                        {"lat": -32.4782971,
                                                        "lon": -61.5805422,
                                                        "name": "Rosario"}].
            alerts_enable (bool): Activa las alertas climáticos.
            preferred_units (str): Hace referencia al sistema de unidades , [Imperial o Métrico]
    """

    user = models.OneToOneField(
        CustomUser, on_delete=models.CASCADE, related_name="preferences")
    favorite_location = models.JSONField(default=list)
    alerts_enabled = models.BooleanField(default=False)
    preferred_units = models.CharField(max_length=10, choices=[(
        'metric', 'Métrico'), ('imperial', 'Imperial')], default='metric')

    def __str__(self):
        return f"Preferencias de {self.user.username}"


class FrostAlert(models.Model):
    """
    Registro de una alerta de helada ya notificada.

    Existe para no volver a avisar por la misma localidad y la misma fecha:
    sin esto, cada corrida del comando de alertas mandaría otro mail.
    """

    user = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, related_name="frost_alerts"
    )
    location_name = models.CharField(max_length=255)
    latitude = models.FloatField()
    longitude = models.FloatField()
    forecast_date = models.DateField(
        help_text="Día del pronóstico al que corresponde la helada."
    )
    probability = models.PositiveSmallIntegerField(
        help_text="Probabilidad de helada informada, de 0 a 100."
    )
    min_temperature = models.FloatField(
        help_text="Temperatura mínima prevista en °C."
    )
    notified_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Una alerta por usuario, localidad y día.
        constraints = [
            models.UniqueConstraint(
                fields=["user", "location_name", "forecast_date"],
                name="unique_frost_alert_per_user_location_day",
            )
        ]
        indexes = [models.Index(fields=["user", "forecast_date"])]
        ordering = ["-forecast_date"]

    def __str__(self):
        return f"Helada {self.forecast_date} en {self.location_name} ({self.user.username})"
