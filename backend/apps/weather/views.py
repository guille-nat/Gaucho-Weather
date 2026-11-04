from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.throttling import IPScopedRateThrottle
from apps.places.http import ServiceUnavailable, read_coordinates
from apps.places.service import reverse_or_none

from .ondemand import ForecastUnavailable, forecast_for

UNAVAILABLE = "No pudimos obtener el pronóstico. Probá en un rato."


class PublicForecastView(APIView):
    """GET /api/pronostico/?lat=&lon= (S10): no account needed, throttled per IP."""

    permission_classes = [AllowAny]
    authentication_classes = []  # public and read-only: no session, so no CSRF
    throttle_classes = [IPScopedRateThrottle]
    throttle_scope = "public_forecast"

    def get(self, request):
        latitude, longitude = read_coordinates(request.query_params)
        try:
            forecast = forecast_for(latitude, longitude)
        except ForecastUnavailable as exc:
            raise ServiceUnavailable(UNAVAILABLE) from exc
        return Response({**forecast.payload, "place": reverse_or_none(latitude, longitude)})
