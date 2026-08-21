"""
Endpoints de salud para el balanceador y los healthchecks de Docker.

Se separan a propósito:
  - /healthz  responde sin tocar dependencias. Sirve para saber si el proceso
              está vivo (liveness). Nunca debe fallar por una dependencia caída.
  - /readyz   verifica base y caché. Sirve para saber si el contenedor puede
              recibir tráfico (readiness).
"""

import logging

from django.db import connection
from django.core.cache import cache
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

logger = logging.getLogger(__name__)

READINESS_CACHE_KEY = "healthcheck:ping"


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def healthz(request):
    """Liveness: el proceso responde."""
    return Response({"status": "ok"}, status=status.HTTP_200_OK)


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def readyz(request):
    """Readiness: base y caché disponibles."""
    checks = {}

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        checks["database"] = "ok"
    except Exception as exc:  # noqa: BLE001 - queremos reportar cualquier fallo
        logger.error("Healthcheck de base falló: %s", exc)
        checks["database"] = "error"

    # django-redis corre con IGNORE_EXCEPTIONS, así que una caída de Redis no
    # levanta excepción: devuelve None. Por eso comparamos el valor escrito.
    try:
        cache.set(READINESS_CACHE_KEY, "pong", timeout=10)
        checks["cache"] = "ok" if cache.get(READINESS_CACHE_KEY) == "pong" else "error"
    except Exception as exc:  # noqa: BLE001
        logger.error("Healthcheck de caché falló: %s", exc)
        checks["cache"] = "error"

    healthy = all(value == "ok" for value in checks.values())
    return Response(
        {"status": "ok" if healthy else "degraded", "checks": checks},
        status=status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
    )
