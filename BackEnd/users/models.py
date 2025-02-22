from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone


class CustomUser(AbstractUser):
    email_verify = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        self.username = self.username.lower()
        self.email = self.email.lower()
        self.last_login = timezone.now()
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
