from django.contrib import admin

from .models import AlertEvent, AlertRule, PushSubscription


@admin.register(AlertRule)
class AlertRuleAdmin(admin.ModelAdmin):
    list_display = ["__str__", "user", "comparator", "threshold", "enabled", "created_at"]
    list_filter = ["variable", "enabled"]
    search_fields = ["user__email", "lote__name"]
    raw_id_fields = ["user", "lote"]


@admin.register(AlertEvent)
class AlertEventAdmin(admin.ModelAdmin):
    list_display = ["title", "user", "target_date", "push_status", "email_status", "read_at"]
    list_filter = ["push_status", "email_status", "target_date"]
    search_fields = ["user__email", "title"]
    raw_id_fields = ["user", "rule", "lote"]


@admin.register(PushSubscription)
class PushSubscriptionAdmin(admin.ModelAdmin):
    list_display = ["user", "user_agent", "created_at"]
    search_fields = ["user__email"]
    raw_id_fields = ["user"]
