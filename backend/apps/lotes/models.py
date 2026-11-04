from django.conf import settings
from django.db import models


class Crop(models.TextChoices):
    SOJA = "soja", "Soja"
    MAIZ = "maiz", "Maíz"
    TRIGO = "trigo", "Trigo"
    GIRASOL = "girasol", "Girasol"
    CEBADA = "cebada", "Cebada"
    SORGO = "sorgo", "Sorgo"
    OTRO = "otro", "Otro"


class Lote(models.Model):
    """A field with its exact location; crop and sowing date are optional (S4)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="lotes"
    )
    name = models.CharField("nombre", max_length=80)
    establishment = models.CharField("establecimiento", max_length=120, blank=True)
    locality = models.CharField("localidad", max_length=120, blank=True)
    latitude = models.DecimalField("latitud", max_digits=9, decimal_places=6)
    longitude = models.DecimalField("longitud", max_digits=9, decimal_places=6)
    # Null, not "", is "no crop": the API contract exposes it as null (S8).
    crop = models.CharField(  # noqa: DJ001
        "cultivo", max_length=10, choices=Crop.choices, null=True, blank=True
    )
    sowing_date = models.DateField("fecha de siembra", null=True, blank=True)
    area_ha = models.DecimalField(
        "superficie (ha)", max_digits=10, decimal_places=2, null=True, blank=True
    )
    boundary = models.JSONField("contorno (GeoJSON Polygon)", null=True, blank=True)
    created_at = models.DateTimeField("creado", auto_now_add=True)
    updated_at = models.DateTimeField("modificado", auto_now=True)

    class Meta:
        verbose_name = "lote"
        verbose_name_plural = "lotes"
        ordering = ["name", "id"]

    def __str__(self) -> str:
        return self.name
