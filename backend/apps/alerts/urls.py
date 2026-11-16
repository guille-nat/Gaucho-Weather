from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    AlertEventListView,
    AlertRuleViewSet,
    MarkReadView,
    PushKeyView,
    PushSubscriptionView,
)

router = SimpleRouter()
router.register("alertas/reglas", AlertRuleViewSet, basename="alert-rule")

urlpatterns = [
    path("alertas/eventos/", AlertEventListView.as_view(), name="alert-events"),
    path("alertas/eventos/leer/", MarkReadView.as_view(), name="alert-events-read"),
    path("alertas/push/clave/", PushKeyView.as_view(), name="alert-push-key"),
    path("alertas/push/", PushSubscriptionView.as_view(), name="alert-push"),
    *router.urls,
]
