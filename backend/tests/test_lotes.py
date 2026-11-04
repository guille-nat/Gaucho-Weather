from datetime import UTC, datetime
from decimal import Decimal

import pytest
import time_machine

from apps.archiver.models import ForecastSnapshot
from apps.lotes.models import Lote

pytestmark = pytest.mark.django_db

URL = "/api/lotes/"

SQUARE = {
    "type": "Polygon",
    "coordinates": [[[-61.0, -33.0], [-60.9, -33.0], [-60.9, -33.1], [-61.0, -33.0]]],
}


def lote_payload(**overrides):
    payload = {"name": "La Esperanza", "latitude": -33.04, "longitude": -61.06}
    payload.update(overrides)
    return payload


def make_lote(user, **fields):
    data = {"name": "Lote", "latitude": Decimal("-33.04"), "longitude": Decimal("-61.06")}
    data.update(fields)
    return Lote.objects.create(user=user, **data)


class TestCrud:
    def test_create_with_all_fields(self, auth_client, user):
        response = auth_client.post(
            URL,
            lote_payload(
                establishment="Don Julio",
                locality="Firmat",
                crop="soja",
                sowing_date="2026-10-20",
                area_ha="120.5",
                boundary=SQUARE,
            ),
            format="json",
        )

        assert response.status_code == 201
        body = response.json()
        lote = Lote.objects.get()
        assert lote.user == user
        assert body["id"] == lote.id
        assert body["name"] == "La Esperanza"
        assert body["establishment"] == "Don Julio"
        assert body["locality"] == "Firmat"
        assert body["latitude"] == -33.04
        assert body["longitude"] == -61.06
        assert body["crop"] == "soja"
        assert body["sowing_date"] == "2026-10-20"
        assert body["area_ha"] == 120.5
        assert body["boundary"] == SQUARE
        assert body["summary"] is None
        assert {"created_at", "updated_at"} <= set(body)

    def test_create_minimal_defaults(self, auth_client):
        response = auth_client.post(URL, lote_payload(), format="json")

        assert response.status_code == 201
        body = response.json()
        assert body["establishment"] == ""
        assert body["locality"] == ""
        assert body["crop"] is None
        assert body["sowing_date"] is None
        assert body["area_ha"] is None
        assert body["boundary"] is None

    def test_gps_coordinates_with_many_decimals_are_rounded(self, auth_client):
        response = auth_client.post(
            URL, lote_payload(latitude=-33.123456789, longitude=-61.987654321), format="json"
        )

        assert response.status_code == 201
        assert response.json()["latitude"] == -33.123457
        assert response.json()["longitude"] == -61.987654

    def test_list_only_own_ordered_by_name(self, auth_client, user, make_user):
        make_lote(user, name="Zanja")
        make_lote(user, name="Arroyo")
        make_lote(make_user(email="otro@example.com"), name="Ajeno")

        response = auth_client.get(URL)

        assert response.status_code == 200
        assert [lote["name"] for lote in response.json()] == ["Arroyo", "Zanja"]

    def test_retrieve_patch_delete_own(self, auth_client, user):
        lote = make_lote(user)

        assert auth_client.get(f"{URL}{lote.id}/").json()["name"] == "Lote"

        patched = auth_client.patch(f"{URL}{lote.id}/", {"crop": "maiz"}, format="json")
        assert patched.status_code == 200
        assert patched.json()["crop"] == "maiz"
        lote.refresh_from_db()
        assert lote.crop == "maiz"

        assert auth_client.delete(f"{URL}{lote.id}/").status_code == 204
        assert not Lote.objects.exists()

    def test_other_users_lote_is_404(self, auth_client, make_user):
        other = make_lote(make_user(email="otro@example.com"), name="Ajeno")
        detail = f"{URL}{other.id}/"

        assert auth_client.get(detail).status_code == 404
        assert auth_client.patch(detail, {"name": "Mío"}, format="json").status_code == 404
        assert auth_client.delete(detail).status_code == 404
        other.refresh_from_db()
        assert other.name == "Ajeno"

    def test_anonymous_is_403(self, api_client, db):
        assert api_client.get(URL).status_code == 403
        assert api_client.post(URL, lote_payload(), format="json").status_code == 403

    def test_create_requires_csrf_token(self, csrf_client, user):
        csrf_client.force_login(user)

        assert csrf_client.post(URL, lote_payload(), format="json").status_code == 403
        token = csrf_client.get("/api/auth/csrf/").cookies["csrftoken"].value
        response = csrf_client.post(URL, lote_payload(), format="json", HTTP_X_CSRFTOKEN=token)
        assert response.status_code == 201


class TestValidation:
    @pytest.mark.parametrize(
        ("overrides", "field"),
        [
            ({"latitude": -20.9}, "latitude"),
            ({"latitude": -56.1}, "latitude"),
            ({"longitude": -52.9}, "longitude"),
            ({"longitude": -74.1}, "longitude"),
            ({"name": "x" * 81}, "name"),
            ({"name": ""}, "name"),
            ({"crop": "papa"}, "crop"),
            ({"area_ha": -1}, "area_ha"),
            ({"boundary": {"type": "Point", "coordinates": [-61, -33]}}, "boundary"),
            (
                {
                    "boundary": {
                        "type": "Polygon",
                        "coordinates": [[[-61, -33], [-60.9, -33], [-60.9, -33.1], [-61, -33.1]]],
                    }
                },
                "boundary",
            ),
            ({"boundary": {"type": "Polygon", "coordinates": "nope"}}, "boundary"),
        ],
    )
    def test_invalid_field(self, auth_client, overrides, field):
        response = auth_client.post(URL, lote_payload(**overrides), format="json")

        assert response.status_code == 400
        assert list(response.json()) == [field]
        assert not Lote.objects.exists()

    def test_required_fields(self, auth_client):
        response = auth_client.post(URL, {}, format="json")

        assert response.status_code == 400
        assert set(response.json()) == {"name", "latitude", "longitude"}
        assert response.json()["name"] == ["Este campo es requerido."]

    def test_bounds_are_inclusive(self, auth_client):
        response = auth_client.post(URL, lote_payload(latitude=-21, longitude=-74), format="json")

        assert response.status_code == 201

    def test_summary_is_read_only(self, auth_client):
        response = auth_client.post(URL, lote_payload(summary={"x": 1}), format="json")

        assert response.status_code == 201
        assert response.json()["summary"] is None


def snapshot(model, temps_by_hour, fetched_at, cell=(Decimal("-33.0"), Decimal("-61.1"))):
    times = sorted(temps_by_hour)
    return ForecastSnapshot.objects.create(
        cell_lat=cell[0],
        cell_lon=cell[1],
        model=model,
        kind=ForecastSnapshot.Kind.DETERMINISTIC,
        fetched_at=fetched_at,
        fetch_hour=fetched_at.replace(minute=0, second=0, microsecond=0),
        payload={
            "hourly": {"time": times, "temperature_2m": [temps_by_hour[t] for t in times]},
        },
    )


# 2026-11-03 15:00 in Buenos Aires (UTC-3).
AFTERNOON = datetime(2026, 11, 3, 18, 0, tzinfo=UTC)


class TestSummary:
    def test_null_without_archived_forecast(self, auth_client, user):
        lote = make_lote(user)

        assert auth_client.get(f"{URL}{lote.id}/").json()["summary"] is None
        assert auth_client.get(URL).json()[0]["summary"] is None

    @time_machine.travel(AFTERNOON, tick=False)
    def test_tonight_min_per_model_and_overall(self, auth_client, user):
        lote = make_lote(user)  # cell (-33.0, -61.1)
        fetched = datetime(2026, 11, 3, 12, 5, tzinfo=UTC)
        snapshot(
            "ecmwf_ifs025",
            {
                "2026-11-03T19:00": -5.0,  # before 20:00, ignored
                "2026-11-03T20:00": 6.0,
                "2026-11-04T03:00": 1.24,
                "2026-11-04T08:00": 2.0,
                "2026-11-04T09:00": -9.0,  # after 08:00, ignored
            },
            fetched,
        )
        snapshot("gfs_seamless", {"2026-11-03T22:00": 3.0, "2026-11-04T05:00": None}, fetched)
        # An older ICON run with a lower value must lose to the latest one.
        snapshot("icon_seamless", {"2026-11-04T04:00": -3.0}, datetime(2026, 11, 2, 12, tzinfo=UTC))
        latest_icon = datetime(2026, 11, 3, 13, 0, tzinfo=UTC)
        snapshot("icon_seamless", {"2026-11-04T04:00": 0.5}, latest_icon)

        expected = {
            "tonight_min_c_2m": 0.5,
            "tonight_min_models": {"ecmwf_ifs025": 1.2, "gfs_seamless": 3.0, "icon_seamless": 0.5},
            "fetched_at": "2026-11-03T10:00:00-03:00",
        }
        assert auth_client.get(f"{URL}{lote.id}/").json()["summary"] == expected
        assert auth_client.get(URL).json()[0]["summary"] == expected

    @time_machine.travel(datetime(2026, 11, 4, 9, 0, tzinfo=UTC), tick=False)  # 06:00 local
    def test_before_eight_uses_the_night_in_progress(self, auth_client, user):
        lote = make_lote(user)
        fetched = datetime(2026, 11, 3, 12, 0, tzinfo=UTC)
        snapshot(
            "ecmwf_ifs025",
            {"2026-11-03T23:00": 4.0, "2026-11-04T21:00": -2.0},
            fetched,
        )

        summary = auth_client.get(f"{URL}{lote.id}/").json()["summary"]

        assert summary["tonight_min_c_2m"] == 4.0

    @time_machine.travel(AFTERNOON, tick=False)
    def test_overall_null_when_no_hours_in_window(self, auth_client, user):
        lote = make_lote(user)
        snapshot("gfs_seamless", {"2026-11-03T12:00": 10.0}, datetime(2026, 11, 3, 12, tzinfo=UTC))

        summary = auth_client.get(f"{URL}{lote.id}/").json()["summary"]

        assert summary["tonight_min_c_2m"] is None
        assert summary["tonight_min_models"] == {"gfs_seamless": None}

    @time_machine.travel(AFTERNOON, tick=False)
    def test_ignores_ensembles_and_other_cells(self, auth_client, user):
        lote = make_lote(user)
        fetched = datetime(2026, 11, 3, 12, tzinfo=UTC)
        snapshot(
            "gfs_seamless",
            {"2026-11-04T02:00": -1.0},
            fetched,
            cell=(Decimal("-33.1"), Decimal("-61.1")),
        )
        ForecastSnapshot.objects.create(
            cell_lat=Decimal("-33.0"),
            cell_lon=Decimal("-61.1"),
            model="gfs025",
            kind=ForecastSnapshot.Kind.ENSEMBLE,
            fetched_at=fetched,
            fetch_hour=fetched,
            payload={"hourly": {"time": ["2026-11-04T02:00"], "temperature_2m": [-8.0]}},
        )

        assert auth_client.get(f"{URL}{lote.id}/").json()["summary"] is None
