from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from rest_framework import serializers

from apps.archiver.cells import grid_cell
from apps.archiver.summary import tonight_summaries

from .geojson import is_polygon
from .models import Lote

INVALID_POLYGON_MESSAGE = (
    'Debe ser un polígono GeoJSON: {"type": "Polygon", "coordinates": [[[lon, lat], ...]]} '
    "con anillos cerrados de al menos 4 puntos."
)


class RoundedDecimalField(serializers.DecimalField):
    """Rounds extra decimals instead of rejecting them (GPS readings carry many)."""

    def validate_precision(self, value):
        step = Decimal(1).scaleb(-self.decimal_places)
        try:
            value = value.quantize(step, rounding=ROUND_HALF_UP)
        except InvalidOperation:
            self.fail("max_digits", max_digits=self.max_digits)
        return super().validate_precision(value)


class LoteSerializer(serializers.ModelSerializer):
    latitude = RoundedDecimalField(
        max_digits=9, decimal_places=6, min_value=Decimal("-56"), max_value=Decimal("-21")
    )
    longitude = RoundedDecimalField(
        max_digits=9, decimal_places=6, min_value=Decimal("-74"), max_value=Decimal("-53")
    )
    area_ha = RoundedDecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal("0"), allow_null=True, required=False
    )
    summary = serializers.SerializerMethodField()

    class Meta:
        model = Lote
        fields = [
            "id",
            "name",
            "establishment",
            "locality",
            "latitude",
            "longitude",
            "crop",
            "sowing_date",
            "area_ha",
            "boundary",
            "summary",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "summary", "created_at", "updated_at"]

    def validate_crop(self, value):
        # A form select's empty option sends "", which means "no crop" (null).
        return value or None

    def validate_boundary(self, value):
        if value is not None and not is_polygon(value):
            raise serializers.ValidationError(INVALID_POLYGON_MESSAGE)
        return value

    def get_summary(self, lote: Lote):
        cell = grid_cell(lote.latitude, lote.longitude)
        cache = self.context.setdefault("summaries", {})
        if cell not in cache:
            cache.update(tonight_summaries({cell}))
            cache.setdefault(cell, None)
        summary = cache[cell]
        if summary is None:
            return None
        # Same local-time ISO format as created_at/updated_at.
        return {**summary, "fetched_at": _datetime_field.to_representation(summary["fetched_at"])}


_datetime_field = serializers.DateTimeField()
