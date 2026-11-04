"""Place search and reverse lookup with a shared cache (S10).

Place names barely change, so answers are cached for PLACES_CACHE_SECONDS
(a day by default). Failures are never cached.
"""

import hashlib
import unicodedata
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.core.cache import cache

from . import georef

MAX_RESULTS = 8
PROVIDER_LIMIT = 30  # room to drop duplicates and re-rank before keeping 8
MAX_QUERY_LENGTH = 100
REVERSE_STEP = Decimal("0.001")  # about 100 m: points closer than that share an answer
_MISSING = object()


def fold(text: str) -> str:
    """Lowercase without accents, for comparing "cordoba" with "Córdoba"."""
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def _key(kind: str, text: str) -> str:
    return f"places:{kind}:{hashlib.sha256(text.encode()).hexdigest()}"


def _rank(places: list[dict], query: str) -> list[dict]:
    """Exact names first, then names that start with the query, keeping Georef's order."""
    wanted = fold(query)

    def rank(place):
        name = fold(place["name"])
        return 0 if name == wanted else 1 if name.startswith(wanted) else 2

    unique, seen = [], set()
    for place in sorted(places, key=rank):
        identity = (place["name"], place["region"])
        if identity not in seen:
            seen.add(identity)
            unique.append(place)
    return unique[:MAX_RESULTS]


def search(query: str) -> list[dict]:
    """Up to 8 Argentine places matching `query`. Raises georef.PlacesUnavailable."""
    query = " ".join(query.split())[:MAX_QUERY_LENGTH]
    key = _key("search", fold(query))
    cached = cache.get(key)
    if cached is not None:
        return cached
    places = _rank(georef.localidades(query, PROVIDER_LIMIT), query)
    cache.set(key, places, settings.PLACES_CACHE_SECONDS)
    return places


def _plain(value: Decimal) -> str:
    return format(value.quantize(REVERSE_STEP, rounding=ROUND_HALF_UP).normalize(), "f")


def reverse(latitude: Decimal, longitude: Decimal) -> dict | None:
    """`{name, region}` of the point, or None. Raises georef.PlacesUnavailable."""
    lat, lon = _plain(latitude), _plain(longitude)
    key = _key("reverse", f"{lat},{lon}")
    cached = cache.get(key, _MISSING)
    if cached is not _MISSING:
        return cached
    place = georef.ubicacion(lat, lon)
    cache.set(key, place, settings.PLACES_CACHE_SECONDS)
    return place


def reverse_or_none(latitude: Decimal, longitude: Decimal) -> dict | None:
    """Like reverse, but a provider failure is just "no place" (the forecast still answers)."""
    try:
        return reverse(latitude, longitude)
    except georef.PlacesUnavailable:
        return None
