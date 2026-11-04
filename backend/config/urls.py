from django.contrib import admin
from django.urls import include, path

from .views import health

# Everything lives under /api/ so a single reverse-proxy rule (Vite in dev,
# nginx in prod) reaches the whole backend, admin and its static files included.
urlpatterns = [
    path("api/admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/", include("apps.lotes.urls")),
]
