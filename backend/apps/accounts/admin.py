from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm

from .models import FounderProgram, Plan, User


class UserAddForm(UserCreationForm):
    class Meta:
        model = User
        fields = ["email", "name"]


class UserEditForm(UserChangeForm):
    class Meta:
        model = User
        fields = "__all__"


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = UserEditForm
    add_form = UserAddForm
    ordering = ["email"]
    list_display = ["email", "name", "plan", "founder_number", "plan_expires_at", "date_joined"]
    list_filter = ["plan", "is_staff", "is_active"]
    search_fields = ["email", "name"]
    readonly_fields = ["founder_number"]
    fieldsets = [
        (None, {"fields": ["email", "password"]}),
        ("Datos", {"fields": ["name"]}),
        (
            "Plan",
            {
                "fields": [
                    "plan",
                    "plan_expires_at",
                    "founder_number",
                    "notify_push",
                    "notify_email",
                ]
            },
        ),
        ("Permisos", {"fields": ["is_active", "is_staff", "is_superuser", "groups"]}),
        ("Fechas", {"fields": ["last_login", "date_joined"]}),
    ]
    add_fieldsets = [
        (None, {"classes": ["wide"], "fields": ["email", "name", "password1", "password2"]}),
    ]


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "code",
        "price_ars_month",
        "max_lotes",
        "max_alert_rules",
        "allows_push",
        "priority_support",
        "highlighted",
        "order",
    ]
    list_editable = [
        "price_ars_month",
        "max_lotes",
        "max_alert_rules",
        "allows_push",
        "priority_support",
        "highlighted",
        "order",
    ]
    readonly_fields = ["code"]

    def has_add_permission(self, request):
        return False  # the code knows these three plans by their code

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(FounderProgram)
class FounderProgramAdmin(admin.ModelAdmin):
    list_display = ["__str__", "limit", "trial_days"]
    readonly_fields = ["next_number"]

    def has_add_permission(self, request):
        return not FounderProgram.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
