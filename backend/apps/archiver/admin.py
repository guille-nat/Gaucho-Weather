from django.contrib import admin

from .models import ForecastSnapshot, Observation


@admin.register(ForecastSnapshot)
class ForecastSnapshotAdmin(admin.ModelAdmin):
    list_display = ["fetched_at", "model", "kind", "cell_lat", "cell_lon"]
    list_filter = ["kind", "model"]
    date_hierarchy = "fetched_at"
    readonly_fields = [
        "cell_lat",
        "cell_lon",
        "model",
        "kind",
        "fetched_at",
        "fetch_hour",
        "payload",
    ]


@admin.register(Observation)
class ObservationAdmin(admin.ModelAdmin):
    list_display = [
        "observed_at",
        "station_name",
        "temperature_c",
        "humidity_pct",
        "wind_speed_kmh",
        "wind_direction_deg",
        "pressure_hpa",
    ]
    list_filter = ["station_name"]
    date_hierarchy = "observed_at"
