from django.http import JsonResponse
from rest_framework.exceptions import ParseError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.throttling import IPScopedRateThrottle

from . import service
from .georef import PlacesUnavailable
from .http import ServiceUnavailable, read_coordinates

TOO_SHORT = "Escribí al menos 2 letras para buscar."
SEARCH_DOWN = "No pudimos buscar lugares. Probá en un rato."
REVERSE_DOWN = "No pudimos ubicar el lugar. Probá en un rato."
MIN_QUERY_LENGTH = 2


class PublicPlacesView(APIView):
    """Public and read-only: no session, so no CSRF; one IP bucket for both endpoints."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [IPScopedRateThrottle]
    throttle_scope = "places"


class PlaceSearchView(PublicPlacesView):
    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if len(query) < MIN_QUERY_LENGTH:
            raise ParseError(TOO_SHORT)
        try:
            return Response(service.search(query))
        except PlacesUnavailable as exc:
            raise ServiceUnavailable(SEARCH_DOWN) from exc


class PlaceReverseView(PublicPlacesView):
    def get(self, request):
        latitude, longitude = read_coordinates(request.query_params)
        try:
            place = service.reverse(latitude, longitude)
        except PlacesUnavailable as exc:
            raise ServiceUnavailable(REVERSE_DOWN) from exc
        # DRF renders None as an empty body; the contract says JSON null.
        return JsonResponse(place, safe=False, json_dumps_params={"ensure_ascii": False})
