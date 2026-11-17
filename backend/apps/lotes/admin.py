from django.contrib import admin

from .models import Lote, Planting


class PlantingInline(admin.TabularInline):
    model = Planting
    fields = ["crop", "area_ha", "sowing_date"]
    extra = 0


@admin.register(Lote)
class LoteAdmin(admin.ModelAdmin):
    list_display = ["name", "user", "establishment", "locality", "latitude", "longitude"]
    search_fields = ["name", "establishment", "locality", "user__email"]
    raw_id_fields = ["user"]
    inlines = [PlantingInline]
