from django.urls import path

from . import views

urlpatterns = [
    path("resumen/", views.SummaryView.as_view(), name="backoffice-summary"),
    path("cuentas/", views.AccountListView.as_view(), name="backoffice-accounts"),
    path("cuentas/<int:pk>/plan/", views.AccountPlanView.as_view(), name="backoffice-account-plan"),
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
    path("registro/", views.ActionLogView.as_view(), name="backoffice-log"),
    path("pagos/", views.PaymentListView.as_view(), name="backoffice-payments"),
]
