"""Georef AR client (apis.datos.gob.ar/georef): Argentina's official place names.

CC BY 4.0, commercial use allowed (see Doc/funcionalidades/lugares.md).
Answers are mapped to `{name, region, lat, lon}`; the rest of the app never
sees Georef's shape.
"""

import httpx
from django.conf import settings

from apps.archiver.cells import in_argentina

TIMEOUT = httpx.Timeout(5.0, connect=3.0)
SEARCH_FIELDS = "nombre,provincia.nombre,departamento.nombre,centroide"


class PlacesUnavailable(Exception):
    """Georef could not be reached or answered something unexpected."""


def _get(path: str, params: dict) -> dict:
    try:
        with httpx.Client(timeout=TIMEOUT) as client:
            response = client.get(f"{settings.GEOREF_API_URL}/{path}", params=params)
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise PlacesUnavailable(str(exc)) from exc
    if not isinstance(data, dict):
        raise PlacesUnavailable(f"Unexpected Georef response: {str(data)[:200]}")
    return data


def _name(entity) -> str | None:
    return (entity or {}).get("nombre") or None


def region(name: str, department: str | None, province: str) -> str:
    """Province, preceded by the department when it adds something (not "Rosario, Rosario")."""
    if department and department.casefold() != name.casefold():
        return f"{department}, {province}"
    return province


def localidades(query: str, limit: int) -> list[dict]:
    data = _get("localidades", {"nombre": query, "max": limit, "campos": SEARCH_FIELDS})
    places = []
    for item in data.get("localidades") or []:
        name, province = item.get("nombre"), _name(item.get("provincia"))
        centroid = item.get("centroide") or {}
        lat, lon = centroid.get("lat"), centroid.get("lon")
        if not name or not province or lat is None or lon is None or not in_argentina(lat, lon):
            continue
        places.append(
            {
                "name": name,
                "region": region(name, _name(item.get("departamento")), province),
                "lat": round(lat, 4),
                "lon": round(lon, 4),
            }
        )
    return places


def ubicacion(latitude: str, longitude: str) -> dict | None:
    """The municipality (or, in rural areas, the department) containing the point."""
    location = _get("ubicacion", {"lat": latitude, "lon": longitude}).get("ubicacion") or {}
    province = _name(location.get("provincia"))
    municipality = _name(location.get("municipio"))
    department = _name(location.get("departamento"))
    name = municipality or department
    if not province or not name:
        return None
    return {"name": name, "region": region(name, department if municipality else None, province)}
