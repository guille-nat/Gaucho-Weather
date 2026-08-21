from django.urls import path

from . import views

urlpatterns = [
    path("register", views.create_users, name="register-user"),
    path("profiles", views.get_user_whit_preferences, name="users-profiles"),
    path("update", views.update_user, name="update-user"),
    path("update-preferences", views.update_preferences, name="update-preferences"),
    path("verify-email", views.verify_email, name="verify-email"),
    path(
        "resend-verification",
        views.resend_verification_email,
        name="resend-verification",
    ),
    path(
        "password-reset", views.password_reset_request, name="password-reset-request"
    ),
    path(
        "password-reset/confirm",
        views.password_reset_confirm,
        name="password-reset-confirm",
    ),
    path("frost-alerts", views.list_frost_alerts, name="frost-alerts"),
]
