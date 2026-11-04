from django.contrib import admin

from .models import Lote


@admin.register(Lote)
class LoteAdmin(admin.ModelAdmin):
    list_display = ["name", "user", "establishment", "locality", "crop", "latitude", "longitude"]
    list_filter = ["crop"]
    search_fields = ["name", "establishment", "locality", "user__email"]
    raw_id_fields = ["user"]
