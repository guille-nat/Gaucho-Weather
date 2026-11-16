from rest_framework.routers import SimpleRouter

from .views import AlertRuleViewSet

router = SimpleRouter()
router.register("alertas/reglas", AlertRuleViewSet, basename="alert-rule")

urlpatterns = router.urls
