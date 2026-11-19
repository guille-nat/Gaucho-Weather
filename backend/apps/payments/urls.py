from django.urls import path

from . import views

urlpatterns = [
    path("", views.MyPaymentsView.as_view(), name="payments-mine"),
    path("suscribirme/", views.SubscribeView.as_view(), name="payments-subscribe"),
    path("cancelar/", views.CancelView.as_view(), name="payments-cancel"),
    path(
        "mercadopago/webhook/",
        views.MercadoPagoWebhookView.as_view(),
        name="payments-mercadopago-webhook",
    ),
]
