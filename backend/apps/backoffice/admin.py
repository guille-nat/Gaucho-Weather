from django.contrib import admin

from .models import BackofficeAction


@admin.register(BackofficeAction)
class BackofficeActionAdmin(admin.ModelAdmin):
    """Read-only: the log of backoffice writes is never edited by hand."""

    list_display = ["at", "actor", "action", "target_user"]
    list_filter = ["action"]
    search_fields = ["actor__email", "target_user__email"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
