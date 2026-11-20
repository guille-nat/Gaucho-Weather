from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm
from django.core.exceptions import ValidationError
from django.db import transaction

from . import plans
from .models import FounderProgram, Plan, PlanChange, PlanRequest, User


class UserAddForm(UserCreationForm):
    class Meta:
        model = User
        fields = ["email", "name"]


class UserEditForm(UserChangeForm):
    class Meta:
        model = User
        fields = "__all__"

    def clean_plan(self):
        """A founder moves up to Empresa only by paying the difference (promociones SF4)."""
        plan = self.cleaned_data["plan"]
        try:
            # self.instance still holds the saved plan here: the form copies its data later.
            plans.refuse_free_empresa(self.instance, plan.code)
        except plans.PlanRequestError as exc:
            raise ValidationError(str(exc)) from exc
        return plan


class PlanChangeInline(admin.TabularInline):
    """Read-only plan history (S14): rows come from sign-up, trials, requests and staff edits."""

    model = PlanChange
    fk_name = "user"
    verbose_name_plural = "Historial de planes"
    fields = ["at", "from_plan", "to_plan", "reason", "by", "note"]
    readonly_fields = fields
    extra = 0
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = UserEditForm
    inlines = [PlanChangeInline]
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

    def save_model(self, request, obj, form, change):
        """A plan picked here goes through plans.change_plan, so it is recorded as `staff`."""
        if not (change and "plan" in form.changed_data):
            super().save_model(request, obj, form, change)
            return
        new_plan, expires_at = obj.plan_id, obj.plan_expires_at
        obj.plan_id = User.objects.values_list("plan_id", flat=True).get(pk=obj.pk)
        with transaction.atomic():
            super().save_model(request, obj, form, change)
            plans.change_plan(obj, new_plan, PlanChange.Reason.STAFF, by=request.user)
            if "plan_expires_at" in form.changed_data:
                # Staff set an expiry on purpose in the same edit: keep it.
                obj.plan_expires_at = expires_at
                obj.save(update_fields=["plan_expires_at"])


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "code",
        "price_ars_month",
        "price_usd_month",
        "max_lotes",
        "max_alert_rules",
        "allows_push",
        "priority_support",
        "highlighted",
        "order",
    ]
    list_editable = [
        "price_ars_month",
        "price_usd_month",
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


@admin.register(PlanRequest)
class PlanRequestAdmin(admin.ModelAdmin):
    """Requests from the subscription page (S14). Staff apply them until payment exists."""

    list_display = ["user", "kind", "plan", "status", "created_at", "resolved_at", "resolved_by"]
    list_filter = ["status", "kind", "plan"]
    search_fields = ["user__email", "user__name"]
    readonly_fields = ["user", "kind", "plan", "status", "created_at", "resolved_at", "resolved_by"]
    actions = ["apply_requests", "reject_requests"]

    def has_add_permission(self, request):
        return False

    @admin.action(description="Aplicar pedidos seleccionados", permissions=["change"])
    def apply_requests(self, request, queryset):
        done, refused = [], []
        for pk in queryset.values_list("pk", flat=True):
            try:
                if plans.apply_request(pk, request.user):
                    done.append(pk)
            except plans.PlanRequestError as exc:  # e.g. a founder asking for free Empresa
                refused.append(pk)
                self.message_user(request, f"Pedido {pk}: {exc}", messages.WARNING)
        self._report(request, queryset.exclude(pk__in=refused), done, "aplicados")

    @admin.action(description="Rechazar pedidos seleccionados", permissions=["change"])
    def reject_requests(self, request, queryset):
        done = [
            pk
            for pk in queryset.values_list("pk", flat=True)
            if plans.reject_request(pk, request.user)
        ]
        self._report(request, queryset, done, "rechazados")

    def _report(self, request, queryset, done, verb):
        skipped = queryset.count() - len(done)
        message = f"Pedidos {verb}: {len(done)}."
        if skipped:
            message += f" Omitidos {skipped} que ya no estaban pendientes."
        self.message_user(request, message)
