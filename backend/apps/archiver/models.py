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


class WeatherHour(models.Model):
    """One past hour of weather for a grid cell, in our own shape (not the provider's).

    Our dataset (odd/tasks/cuenta-planes-alertas.md S11): the provider only fills it, so another
    one can be added later under its own `source` without touching the API or the screens.
    """

    cell_lat = models.DecimalField("latitud de la celda", max_digits=4, decimal_places=1)
    cell_lon = models.DecimalField("longitud de la celda", max_digits=4, decimal_places=1)
    time = models.DateTimeField("hora")  # UTC, the hour the values belong to
    source = models.CharField("fuente", max_length=60)
    temperature_c = models.FloatField("temperatura (°C)", null=True, blank=True)
    humidity_pct = models.FloatField("humedad (%)", null=True, blank=True)
    dew_point_c = models.FloatField("punto de rocío (°C)", null=True, blank=True)
    rain_mm = models.FloatField("lluvia (mm)", null=True, blank=True)
    wind_kmh = models.FloatField("viento a 10 m (km/h)", null=True, blank=True)
    wind_dir_deg = models.FloatField("dirección del viento (°)", null=True, blank=True)
    gust_kmh = models.FloatField("ráfaga a 10 m (km/h)", null=True, blank=True)
    fetched_at = models.DateTimeField("descargado")

    class Meta:
        verbose_name = "hora de clima"
        verbose_name_plural = "historial de clima"
        constraints = [
            models.UniqueConstraint(
                fields=["cell_lat", "cell_lon", "source", "time"],
                name="weather_hour_unique_per_source",
            )
        ]
        indexes = [
            models.Index(fields=["cell_lat", "cell_lon", "time"], name="weather_hour_cell_time")
        ]

    def __str__(self) -> str:
        return f"({self.cell_lat}, {self.cell_lon}) {self.time:%Y-%m-%d %H:%M} {self.source}"
