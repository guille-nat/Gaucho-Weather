from django.urls import path
from . import views

urlpatterns = [
    path("register", views.create_users, name="register-user"),
    path("profiles", views.get_user_whit_preferences, name="users-profiles"),
    path("update", views.update_user, name="update-user"),
    path("update-preferences", views.update_preferences, name="update-preferences"),
]
