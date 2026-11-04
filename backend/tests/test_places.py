"""GET /api/lugares/?q= and /api/lugares/reverso/?lat=&lon= (S10), backed by Georef AR."""

import httpx
import pytest
import respx
from django.conf import settings

from apps.accounts.throttling import IPScopedRateThrottle

SEARCH = "/api/lugares/"
REVERSE = "/api/lugares/reverso/"
TOO_SHORT = {"detail": "Escribí al menos 2 letras para buscar."}
SEARCH_DOWN = {"detail": "No pudimos buscar lugares. Probá en un rato."}
REVERSE_DOWN = {"detail": "No pudimos ubicar el lugar. Probá en un rato."}


def localidad(name, province, department, lat, lon):
    return {
        "nombre": name,
        "provincia": {"nombre": province},
        "departamento": {"nombre": department},
        "centroide": {"lat": lat, "lon": lon},
    }


LOCALIDADES = [
    localidad("Arroyo Venado", "Buenos Aires", "Guaminí", -37.0821572185976, -62.5403088035724),
    localidad("Venado Tuerto", "Santa Fe", "General López", -33.7454991566739, -61.9687335249201),
    localidad("Venado Tuerto", "Santa Fe", "General López", -33.7454, -61.9687),  # duplicate
    localidad("Venados Grandes", "Chaco", "Fray Justo Santa María de Oro", -27.81, -61.38),
    localidad("Venado", "Santa Fe", "Venado", -32.0, -60.0),  # department named like it
    localidad("Fuera", "Ninguna", "Ninguno", 10.0, -60.0),  # outside the Argentina bounds
] + [localidad(f"Venado {i}", "Córdoba", "Capital", -31.4, -64.2 + i / 100) for i in range(10)]


def ubicacion(municipio=None, departamento=None, provincia="Santa Fe"):
    return {
        "ubicacion": {
            "provincia": {"id": "82" if provincia else None, "nombre": provincia},
            "departamento": {"id": "1" if departamento else None, "nombre": departamento},
            "municipio": {"id": "2" if municipio else None, "nombre": municipio},
            "lat": -32.95,
            "lon": -60.65,
        }
    }


@pytest.fixture
def georef():
    with respx.mock(assert_all_called=False) as mock:
        yield {
            "search": mock.get(f"{settings.GEOREF_API_URL}/localidades").mock(
                return_value=httpx.Response(
                    200, json={"localidades": LOCALIDADES, "total": len(LOCALIDADES)}
                )
            ),
            "reverse": mock.get(f"{settings.GEOREF_API_URL}/ubicacion").mock(
                return_value=httpx.Response(200, json=ubicacion("Rosario", "Rosario"))
            ),
        }


# --- Search ---------------------------------------------------------------------


@pytest.mark.parametrize("params", [{}, {"q": ""}, {"q": "a"}, {"q": "  v  "}])
def test_search_needs_at_least_two_characters(api_client, georef, params):
    response = api_client.get(SEARCH, params)

    assert response.status_code == 400
    assert response.json() == TOO_SHORT
    assert not georef["search"].called


def test_search_returns_argentine_places_ranked_and_deduplicated(api_client, georef):
    response = api_client.get(SEARCH, {"q": "Venado"})

    assert response.status_code == 200
    places = response.json()
    assert len(places) == 8
    assert places[:3] == [
        {"name": "Venado", "region": "Santa Fe", "lat": -32.0, "lon": -60.0},  # exact name first
        # then the names that start with it, in the provider's order
        {
            "name": "Venado Tuerto",
            "region": "General López, Santa Fe",
            "lat": -33.7455,
            "lon": -61.9687,
        },
        {
            "name": "Venados Grandes",
            "region": "Fray Justo Santa María de Oro, Chaco",
            "lat": -27.81,
            "lon": -61.38,
        },
    ]
    assert places[-1]["name"] == "Venado 4"  # "Arroyo Venado" only contains it: ranked out
    assert [p["name"] for p in places].count("Venado Tuerto") == 1
    assert "Fuera" not in [p["name"] for p in places]
    request = georef["search"].calls.last.request
    assert request.url.params["nombre"] == "Venado"


def test_search_is_accent_and_case_insensitive_for_ranking(api_client, georef):
    georef["search"].mock(
        return_value=httpx.Response(
            200,
            json={
                "localidades": [
                    localidad("Villa Córdoba", "Corrientes", "Mburucuyá", -28.0, -58.2),
                    localidad("Córdoba", "Córdoba", "Capital", -31.415, -64.179),
                ]
            },
        )
    )

    places = api_client.get(SEARCH, {"q": "cordoba"}).json()

    assert [p["name"] for p in places] == ["Córdoba", "Villa Córdoba"]


def test_search_is_cached(api_client, georef):
    first = api_client.get(SEARCH, {"q": "venado"}).json()
    second = api_client.get(SEARCH, {"q": "  VENADO "}).json()

    assert first == second
    assert georef["search"].call_count == 1


def test_search_provider_failure_is_503_and_not_cached(api_client, georef):
    georef["search"].mock(side_effect=httpx.ConnectError("down"))
    response = api_client.get(SEARCH, {"q": "venado"})

    assert response.status_code == 503
    assert response.json() == SEARCH_DOWN

    georef["search"].mock(return_value=httpx.Response(200, json={"localidades": LOCALIDADES[1:2]}))
    assert len(api_client.get(SEARCH, {"q": "venado"}).json()) == 1


def test_search_without_results_is_an_empty_list(api_client, georef):
    georef["search"].mock(return_value=httpx.Response(200, json={"localidades": []}))

    response = api_client.get(SEARCH, {"q": "zzzz"})

    assert response.status_code == 200
    assert response.json() == []


# --- Reverse --------------------------------------------------------------------


def test_reverse_names_the_municipality(api_client, georef):
    response = api_client.get(REVERSE, {"lat": "-32.95", "lon": "-60.65"})

    assert response.status_code == 200
    assert response.json() == {"name": "Rosario", "region": "Santa Fe"}
    request = georef["reverse"].calls.last.request
    assert request.url.params["lat"] == "-32.95"
    assert request.url.params["lon"] == "-60.65"


def test_reverse_falls_back_to_the_department_in_rural_areas(api_client, georef):
    georef["reverse"].mock(
        return_value=httpx.Response(
            200, json=ubicacion(None, "Presidente Roque Sáenz Peña", "Córdoba")
        )
    )

    body = api_client.get(REVERSE, {"lat": "-34.2", "lon": "-63.5"}).json()

    assert body == {"name": "Presidente Roque Sáenz Peña", "region": "Córdoba"}


def test_reverse_is_null_when_no_place_is_found(api_client, georef):
    georef["reverse"].mock(return_value=httpx.Response(200, json=ubicacion(None, None, None)))

    response = api_client.get(REVERSE, {"lat": "-34.2", "lon": "-63.5"})

    assert response.status_code == 200
    assert response.json() is None


def test_reverse_is_cached(api_client, georef):
    api_client.get(REVERSE, {"lat": "-32.95", "lon": "-60.65"})
    api_client.get(REVERSE, {"lat": "-32.95", "lon": "-60.65"})

    assert georef["reverse"].call_count == 1


def test_reverse_provider_failure_is_503(api_client, georef):
    georef["reverse"].mock(return_value=httpx.Response(502))

    response = api_client.get(REVERSE, {"lat": "-32.95", "lon": "-60.65"})

    assert response.status_code == 503
    assert response.json() == REVERSE_DOWN


@pytest.mark.parametrize(
    ("params", "detail"),
    [
        ({"lat": "40", "lon": "-3"}, "Por ahora solo cubrimos Argentina."),
        ({"lat": "x", "lon": "-3"}, "Indicá lat y lon como números."),
        ({}, "Indicá lat y lon como números."),
    ],
)
def test_reverse_validates_coordinates(api_client, georef, params, detail):
    response = api_client.get(REVERSE, params)

    assert response.status_code == 400
    assert response.json() == {"detail": detail}
    assert not georef["reverse"].called


# --- Throttling -----------------------------------------------------------------


def test_places_are_throttled_per_ip(api_client, georef, monkeypatch):
    monkeypatch.setitem(IPScopedRateThrottle.THROTTLE_RATES, "places", "2/hour")

    search = [api_client.get(SEARCH, {"q": "a"}).status_code for _ in range(2)]
    reverse = api_client.get(REVERSE, {"lat": "40", "lon": "-3"}).status_code

    assert search == [400, 400]
    assert reverse == 429  # one bucket for both place endpoints


def test_places_default_rate():
    assert IPScopedRateThrottle.THROTTLE_RATES["places"] == "300/hour"
