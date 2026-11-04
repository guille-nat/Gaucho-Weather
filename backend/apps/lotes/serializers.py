from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from rest_framework import serializers

from apps.archiver.cells import (
    LATITUDE_MAX,
    LATITUDE_MIN,
    LONGITUDE_MAX,
    LONGITUDE_MIN,
    grid_cell,
)
from apps.archiver.forecast import forecasts
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
        max_digits=9, decimal_places=6, min_value=LATITUDE_MIN, max_value=LATITUDE_MAX
    )
    longitude = RoundedDecimalField(
        max_digits=9, decimal_places=6, min_value=LONGITUDE_MIN, max_value=LONGITUDE_MAX
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
        headlines = self.context.setdefault("headlines", {})
        if cell not in headlines:
            forecast = forecasts({cell}).get(cell)
            headlines[cell] = forecast.headline if forecast else None
        # Same local-time ISO format as created_at/updated_at.
        return {
            **summary,
            "fetched_at": _datetime_field.to_representation(summary["fetched_at"]),
            "headline": headlines[cell],
        }


_datetime_field = serializers.DateTimeField()
