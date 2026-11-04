from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm

from .models import User


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
    list_display = ["email", "name", "is_staff", "is_active", "date_joined"]
    search_fields = ["email", "name"]
    fieldsets = [
        (None, {"fields": ["email", "password"]}),
        ("Datos", {"fields": ["name"]}),
        ("Permisos", {"fields": ["is_active", "is_staff", "is_superuser", "groups"]}),
        ("Fechas", {"fields": ["last_login", "date_joined"]}),
    ]
    add_fieldsets = [
        (None, {"classes": ["wide"], "fields": ["email", "name", "password1", "password2"]}),
    ]
