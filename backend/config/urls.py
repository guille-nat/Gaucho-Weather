from django.contrib import admin
from django.urls import include, path

from apps.accounts.views import PlansView

from .views import health

# Everything lives under /api/ so a single reverse-proxy rule (Vite in dev,
# nginx in prod) reaches the whole backend, admin and its static files included.
urlpatterns = [
    path("api/admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/planes/", PlansView.as_view(), name="plans"),
    path("api/", include("apps.lotes.urls")),
    path("api/", include("apps.weather.urls")),
    path("api/", include("apps.places.urls")),
    path("api/", include("apps.alerts.urls")),
    path("api/pagos/", include("apps.payments.urls")),
    path("api/backoffice/", include("apps.backoffice.urls")),
]
