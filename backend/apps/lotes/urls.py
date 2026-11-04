from rest_framework.routers import SimpleRouter

from .views import LoteViewSet

router = SimpleRouter()
router.register("lotes", LoteViewSet, basename="lote")

urlpatterns = router.urls
