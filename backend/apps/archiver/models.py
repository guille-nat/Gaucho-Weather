from django.db import models


class ForecastSnapshot(models.Model):
    """Raw Open-Meteo response for one grid cell, model and kind, as fetched."""

    class Kind(models.TextChoices):
        DETERMINISTIC = "deterministic", "determinístico"
        ENSEMBLE = "ensemble", "ensemble"

    cell_lat = models.DecimalField("latitud de la celda", max_digits=4, decimal_places=1)
    cell_lon = models.DecimalField("longitud de la celda", max_digits=4, decimal_places=1)
    model = models.CharField("modelo", max_length=40)
    kind = models.CharField("tipo", max_length=16, choices=Kind.choices)
    fetched_at = models.DateTimeField("descargado")
    fetch_hour = models.DateTimeField("hora de descarga")  # fetched_at truncated to the hour
    payload = models.JSONField("respuesta")

    class Meta:
        verbose_name = "pronóstico archivado"
        verbose_name_plural = "pronósticos archivados"
        constraints = [
            models.UniqueConstraint(
                fields=["cell_lat", "cell_lon", "model", "kind", "fetch_hour"],
                name="forecast_snapshot_unique_per_hour",
            )
        ]
        indexes = [
            models.Index(
                fields=["cell_lat", "cell_lon", "kind", "model", "-fetched_at"],
                name="forecast_snapshot_latest",
            )
        ]

    def __str__(self) -> str:
        cell = f"({self.cell_lat}, {self.cell_lon})"
        return f"{self.model} {self.kind} {cell} {self.fetched_at:%Y-%m-%d %H:%M}"


class Observation(models.Model):
    """One hourly SMN observation (datohorario file)."""

    station_id = models.CharField("estación (OMM)", max_length=10)
    station_name = models.CharField("estación", max_length=60)
    observed_at = models.DateTimeField("observado")
    temperature_c = models.DecimalField(
        "temperatura (°C)", max_digits=4, decimal_places=1, null=True
    )
    humidity_pct = models.PositiveSmallIntegerField("humedad (%)", null=True)
    pressure_hpa = models.DecimalField("presión (hPa)", max_digits=5, decimal_places=1, null=True)
    wind_direction_deg = models.PositiveSmallIntegerField("dirección del viento (°)", null=True)
    wind_speed_kmh = models.DecimalField(
        "velocidad del viento (km/h)", max_digits=5, decimal_places=1, null=True
    )
    raw_line = models.TextField("línea original")
    created_at = models.DateTimeField("archivado", auto_now_add=True)

    class Meta:
        verbose_name = "observación"
        verbose_name_plural = "observaciones"
        ordering = ["-observed_at", "station_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["station_id", "observed_at"], name="observation_unique_per_station_hour"
            )
        ]

    def __str__(self) -> str:
        return f"{self.station_name} {self.observed_at:%Y-%m-%d %H:%M}"
