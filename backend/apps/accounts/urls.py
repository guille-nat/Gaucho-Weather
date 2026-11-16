from django.urls import path

from . import views

urlpatterns = [
    path("csrf/", views.CsrfView.as_view(), name="auth-csrf"),
    path("register/", views.RegisterView.as_view(), name="auth-register"),
    path("login/", views.LoginView.as_view(), name="auth-login"),
    path("logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("me/", views.MeView.as_view(), name="auth-me"),
    path("suscripcion/", views.SubscriptionView.as_view(), name="auth-subscription"),
    path("suscripcion/pedido/", views.PlanRequestView.as_view(), name="auth-plan-request"),
    path("password/change/", views.PasswordChangeView.as_view(), name="auth-password-change"),
    path("password/reset/", views.PasswordResetView.as_view(), name="auth-password-reset"),
    path(
        "password/reset/confirm/",
        views.PasswordResetConfirmView.as_view(),
        name="auth-password-reset-confirm",
    ),
]
