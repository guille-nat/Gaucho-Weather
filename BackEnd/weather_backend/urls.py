import os

from django.contrib import admin
from django.urls import path, include
from drf_yasg import openapi
from drf_yasg.views import get_schema_view
from rest_framework import permissions
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

from .health import healthz, readyz

schema_view = get_schema_view(
    openapi.Info(
        title="Gaucho Weather API",
        default_version="v1",
        description=(
            "Pronóstico del tiempo y riesgo de heladas para el campo argentino."
        ),
        terms_of_service="https://www.nataliullacoder.com",
        contact=openapi.Contact(email="guillermonatali22@gmail.com"),
        license=openapi.License(name="BSD License nataliullacoder.com"),
    ),
    public=True,
    permission_classes=(permissions.AllowAny,),
)

urlpatterns = [
    # Salud: sin autenticación y sin prefijo /api para que el proxy y Docker
    # los alcancen sin conocer el ruteo interno.
    path("healthz", healthz, name="healthz"),
    path("readyz", readyz, name="readyz"),
    path("api/admin/", admin.site.urls),
    path("api/weather/", include("weather.urls")),
    path("api/users/", include("users.urls")),
    path("api/token", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh", TokenRefreshView.as_view(), name="token_refresh"),
]

# La documentación describe toda la superficie de la API. Se publica solo si se
# habilita de forma explícita; por defecto queda cerrada en producción.
if os.getenv("ENABLE_API_DOCS", "").strip().lower() in {"1", "true", "yes", "on"}:
    urlpatterns += [
        # Login por sesión de la API navegable. Va junto con la documentación
        # porque solo sirve para explorar la API a mano; la app usa JWT.
        path("api-auth/", include("rest_framework.urls")),
        path(
            "api/doc",
            schema_view.with_ui("swagger", cache_timeout=0),
            name="schema-swagger-ui",
        ),
        path(
            "api/redoc/",
            schema_view.with_ui("redoc", cache_timeout=0),
            name="schema-redoc",
        ),
    ]
