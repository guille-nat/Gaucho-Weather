"""Request helpers shared by the public endpoints (places and forecast)."""

from decimal import Decimal, InvalidOperation

from rest_framework import status
from rest_framework.exceptions import APIException, ParseError

from apps.archiver.cells import in_argentina

INVALID_COORDINATES = "Indicá lat y lon como números."
OUTSIDE_ARGENTINA = "Por ahora solo cubrimos Argentina."


class ServiceUnavailable(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE


def read_coordinates(params) -> tuple[Decimal, Decimal]:
    """`lat` and `lon` from the query string, inside Argentina, else a 400 with detail."""
    try:
        latitude, longitude = Decimal(params["lat"]), Decimal(params["lon"])
    except (KeyError, InvalidOperation) as exc:
        raise ParseError(INVALID_COORDINATES) from exc
    if not (latitude.is_finite() and longitude.is_finite()):
        raise ParseError(INVALID_COORDINATES)
    if not in_argentina(latitude, longitude):
        raise ParseError(OUTSIDE_ARGENTINA)
    return latitude, longitude
