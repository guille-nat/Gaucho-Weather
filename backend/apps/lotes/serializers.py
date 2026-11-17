from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from django.db import transaction
from django.db.models import prefetch_related_objects
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
from .models import Lote, Planting

INVALID_POLYGON_MESSAGE = (
    'Debe ser un polígono GeoJSON: {"type": "Polygon", "coordinates": [[[lon, lat], ...]]} '
    "con anillos cerrados de al menos 4 puntos."
)
MAX_PLANTINGS = 8
TOO_MANY_PLANTINGS_MESSAGE = "Hasta 8 cultivos por lote."
NOT_POSITIVE_AREA_MESSAGE = "Tiene que ser mayor que 0."


class RoundedDecimalField(serializers.DecimalField):
    """Rounds extra decimals instead of rejecting them (GPS readings carry many)."""

    def validate_precision(self, value):
        step = Decimal(1).scaleb(-self.decimal_places)
        try:
            value = value.quantize(step, rounding=ROUND_HALF_UP)
        except InvalidOperation:
            self.fail("max_digits", max_digits=self.max_digits)
        return super().validate_precision(value)


class PlantingListSerializer(serializers.ListSerializer):
    def to_internal_value(self, data):
        # Checked before the items, so the error is a plain list on `plantings`.
        if isinstance(data, list) and len(data) > MAX_PLANTINGS:
            raise serializers.ValidationError([TOO_MANY_PLANTINGS_MESSAGE])
        try:
            return super().to_internal_value(data)
        except serializers.ValidationError as exc:
            # DRF 3.18 keys item errors by index; the API contract is one entry per item,
            # {} for a valid one, so the form can match errors to rows by position.
            if isinstance(exc.detail, dict) and all(isinstance(k, int) for k in exc.detail):
                errors = [exc.detail.get(index, {}) for index in range(len(data))]
                raise serializers.ValidationError(errors) from exc
            raise


class PlantingSerializer(serializers.ModelSerializer):
    area_ha = RoundedDecimalField(
        max_digits=10, decimal_places=2, allow_null=True, required=False, coerce_to_string=True
    )

    class Meta:
        model = Planting
        fields = ["id", "crop", "area_ha", "sowing_date"]
        read_only_fields = ["id"]
        list_serializer_class = PlantingListSerializer

    def validate_area_ha(self, value):
        # After rounding, so 0.001 ha (0.00) is refused too.
        if value is not None and value <= 0:
            raise serializers.ValidationError(NOT_POSITIVE_AREA_MESSAGE)
        return value


class LoteListSerializer(serializers.ListSerializer):
    def to_representation(self, data):
        # One query for every lote's plantings, so the list does not grow per lote.
        lotes = list(data.all() if hasattr(data, "all") else data)
        prefetch_related_objects(lotes, "plantings")
        return super().to_representation(lotes)


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
    plantings = PlantingSerializer(many=True, required=False)
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
            "plantings",
            "area_ha",
            "boundary",
            "summary",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "summary", "created_at", "updated_at"]
        list_serializer_class = LoteListSerializer

    def validate_boundary(self, value):
        if value is not None and not is_polygon(value):
            raise serializers.ValidationError(INVALID_POLYGON_MESSAGE)
        return value

    def create(self, validated_data):
        plantings = validated_data.pop("plantings", [])
        with transaction.atomic():
            lote = super().create(validated_data)
            _replace_plantings(lote, plantings)
        return lote

    def update(self, instance, validated_data):
        # Absent on PATCH means unchanged; present replaces the whole list.
        plantings = validated_data.pop("plantings", None)
        with transaction.atomic():
            lote = super().update(instance, validated_data)
            if plantings is not None:
                _replace_plantings(lote, plantings)
        return lote

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


def _replace_plantings(lote: Lote, plantings: list[dict]) -> None:
    lote.plantings.all().delete()
    Planting.objects.bulk_create(Planting(lote=lote, **planting) for planting in plantings)
    getattr(lote, "_prefetched_objects_cache", {}).pop("plantings", None)


_datetime_field = serializers.DateTimeField()
