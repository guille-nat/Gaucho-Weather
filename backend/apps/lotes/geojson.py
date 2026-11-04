"""Minimal GeoJSON Polygon shape check (RFC 7946, section 3.1.6)."""

from numbers import Real


def _is_position(value) -> bool:
    return (
        isinstance(value, list)
        and len(value) in (2, 3)
        and all(isinstance(n, Real) and not isinstance(n, bool) for n in value)
        and -180 <= value[0] <= 180
        and -90 <= value[1] <= 90
    )


def _is_linear_ring(value) -> bool:
    return (
        isinstance(value, list)
        and len(value) >= 4
        and all(_is_position(position) for position in value)
        and value[0] == value[-1]
    )


def is_polygon(value) -> bool:
    if not isinstance(value, dict) or value.get("type") != "Polygon":
        return False
    rings = value.get("coordinates")
    return isinstance(rings, list) and len(rings) >= 1 and all(_is_linear_ring(r) for r in rings)
