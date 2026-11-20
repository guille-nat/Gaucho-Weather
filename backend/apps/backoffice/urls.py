from django.urls import include, path

from . import views

urlpatterns = [
    path("resumen/", views.SummaryView.as_view(), name="backoffice-summary"),
    path("cuentas/", views.AccountListView.as_view(), name="backoffice-accounts"),
    path("cuentas/<int:pk>/", views.AccountRecordView.as_view(), name="backoffice-account"),
    path("cuentas/<int:pk>/plan/", views.AccountPlanView.as_view(), name="backoffice-account-plan"),
    path("cuentas/<int:pk>/bloquear/", views.BlockView.as_view(), name="backoffice-account-block"),
    path(
        "cuentas/<int:pk>/desbloquear/",
        views.UnblockView.as_view(),
        name="backoffice-account-unblock",
    ),
    path(
        "cuentas/<int:pk>/superadmin/dar/",
        views.SuperadminGrantView.as_view(),
        name="backoffice-account-superadmin-grant",
    ),
    path(
        "cuentas/<int:pk>/superadmin/quitar/",
        views.SuperadminRevokeView.as_view(),
        name="backoffice-account-superadmin-revoke",
    ),
    path(
        "cuentas/<int:pk>/restablecer-contrasena/",
        views.PasswordResetView.as_view(),
        name="backoffice-account-password-reset",
    ),
    path("cuentas/<int:pk>/prueba/", views.TrialView.as_view(), name="backoffice-account-trial"),
    path(
        "cuentas/<int:pk>/founder/dar/",
        views.FounderGrantView.as_view(),
        name="backoffice-account-founder-grant",
    ),
    path(
        "cuentas/<int:pk>/founder/quitar/",
        views.FounderRevokeView.as_view(),
        name="backoffice-account-founder-revoke",
    ),
    path(
        "cuentas/<int:pk>/suscripcion/sincronizar/",
        views.SubscriptionSyncView.as_view(),
        name="backoffice-account-subscription-sync",
    ),
    path(
        "cuentas/<int:pk>/suscripcion/cancelar/",
        views.SubscriptionCancelView.as_view(),
        name="backoffice-account-subscription-cancel",
    ),
    path("pedidos/", views.RequestListView.as_view(), name="backoffice-requests"),
    path(
        "pedidos/<int:pk>/aplicar/",
        views.ApplyRequestView.as_view(),
        name="backoffice-request-apply",
    ),
    path(
        "pedidos/<int:pk>/rechazar/",
        views.RejectRequestView.as_view(),
        name="backoffice-request-reject",
    ),
    path("precios/", views.PriceListView.as_view(), name="backoffice-prices"),
    path("precios/<slug:code>/", views.PriceDetailView.as_view(), name="backoffice-price"),
    path(
        "precios/<slug:code>/cambio/",
        views.PriceChangeView.as_view(),
        name="backoffice-price-change",
    ),
    path("registro/", views.ActionLogView.as_view(), name="backoffice-log"),
    path("pagos/", views.PaymentListView.as_view(), name="backoffice-payments"),
    path("informes/", include("apps.backoffice.reports")),
]
