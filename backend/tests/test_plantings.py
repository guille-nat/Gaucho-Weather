"""A lote holds a list of plantings: crop, optional hectares and sowing date (S1, S4)."""

from datetime import date
from decimal import Decimal

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from apps.lotes.models import Lote, Planting

URL = "/api/lotes/"
MAX_MESSAGE = "Hasta 8 cultivos por lote."


def make_lote(user, **fields):
    data = {"name": "Lote", "latitude": Decimal("-33.04"), "longitude": Decimal("-61.06")}
    data.update(fields)
    return Lote.objects.create(user=user, **data)


def lote_payload(**overrides):
    payload = {"name": "La Esperanza", "latitude": -33.04, "longitude": -61.06}
    payload.update(overrides)
    return payload


def stored(lote):
    return list(lote.plantings.values_list("crop", "area_ha", "sowing_date"))


@pytest.mark.django_db
class TestRead:
    def test_plantings_ordered_by_id_with_nulls(self, auth_client, user):
        lote = make_lote(user)
        first = Planting.objects.create(
            lote=lote, crop="trigo", area_ha=Decimal("12.5"), sowing_date=date(2026, 10, 1)
        )
        bare = Planting.objects.create(lote=lote, crop="maiz")

        expected = [
            {
                "id": first.id,
                "crop": "trigo",
                "area_ha": "12.50",
                "sowing_date": "2026-10-01",
            },
            {"id": bare.id, "crop": "maiz", "area_ha": None, "sowing_date": None},
        ]
        assert auth_client.get(f"{URL}{lote.id}/").json()["plantings"] == expected
        assert auth_client.get(URL).json()[0]["plantings"] == expected

    def test_lote_without_plantings_is_empty_list(self, auth_client, user):
        lote = make_lote(user)

        body = auth_client.get(f"{URL}{lote.id}/").json()

        assert body["plantings"] == []
        assert "crop" not in body
        assert "sowing_date" not in body


@pytest.mark.django_db
class TestWrite:
    def test_create_with_plantings(self, auth_client):
        response = auth_client.post(
            URL,
            lote_payload(
                plantings=[
                    {"crop": "soja", "area_ha": "40", "sowing_date": "2026-11-02"},
                    {"crop": "maiz"},
                ]
            ),
            format="json",
        )

        assert response.status_code == 201
        lote = Lote.objects.get()
        assert stored(lote) == [
            ("soja", Decimal("40.00"), date(2026, 11, 2)),
            ("maiz", None, None),
        ]
        ids = list(lote.plantings.values_list("id", flat=True))
        assert [p["id"] for p in response.json()["plantings"]] == ids
        assert response.json()["plantings"][0]["area_ha"] == "40.00"

    def test_create_without_plantings_is_empty(self, auth_client):
        response = auth_client.post(URL, lote_payload(), format="json")

        assert response.status_code == 201
        assert response.json()["plantings"] == []
        assert not Planting.objects.exists()

    def test_patch_replaces_the_whole_list(self, auth_client, user):
        lote = make_lote(user)
        old = Planting.objects.create(lote=lote, crop="soja", area_ha=Decimal("10"))

        response = auth_client.patch(
            f"{URL}{lote.id}/",
            {"plantings": [{"crop": "girasol", "area_ha": 5}, {"crop": "sorgo"}]},
            format="json",
        )

        assert response.status_code == 200
        assert stored(lote) == [("girasol", Decimal("5.00"), None), ("sorgo", None, None)]
        assert not Planting.objects.filter(id=old.id).exists()
        assert [p["crop"] for p in response.json()["plantings"]] == ["girasol", "sorgo"]

    def test_patch_with_empty_list_clears(self, auth_client, user):
        lote = make_lote(user)
        Planting.objects.create(lote=lote, crop="soja")

        response = auth_client.patch(f"{URL}{lote.id}/", {"plantings": []}, format="json")

        assert response.status_code == 200
        assert response.json()["plantings"] == []
        assert not lote.plantings.exists()

    def test_patch_without_plantings_keeps_them(self, auth_client, user):
        lote = make_lote(user)
        kept = Planting.objects.create(lote=lote, crop="soja", sowing_date=date(2026, 10, 5))

        response = auth_client.patch(f"{URL}{lote.id}/", {"name": "Nuevo"}, format="json")

        assert response.status_code == 200
        assert [p["id"] for p in response.json()["plantings"]] == [kept.id]
        assert stored(lote) == [("soja", None, date(2026, 10, 5))]

    def test_same_crop_twice_is_allowed(self, auth_client):
        response = auth_client.post(
            URL,
            lote_payload(
                plantings=[
                    {"crop": "soja", "sowing_date": "2026-10-15"},
                    {"crop": "soja", "sowing_date": "2026-12-20"},
                ]
            ),
            format="json",
        )

        assert response.status_code == 201
        assert [crop for crop, _, _ in stored(Lote.objects.get())] == ["soja", "soja"]

    def test_eight_plantings_are_allowed(self, auth_client):
        response = auth_client.post(
            URL, lote_payload(plantings=[{"crop": "soja"}] * 8), format="json"
        )

        assert response.status_code == 201
        assert Planting.objects.count() == 8

    def test_more_than_eight_is_refused(self, auth_client, user):
        lote = make_lote(user)
        Planting.objects.create(lote=lote, crop="trigo")

        created = auth_client.post(
            URL, lote_payload(plantings=[{"crop": "soja"}] * 9), format="json"
        )
        patched = auth_client.patch(
            f"{URL}{lote.id}/", {"plantings": [{"crop": "soja"}] * 9}, format="json"
        )

        assert created.status_code == 400
        assert created.json() == {"plantings": [MAX_MESSAGE]}
        assert patched.status_code == 400
        assert patched.json() == {"plantings": [MAX_MESSAGE]}
        assert Lote.objects.count() == 1
        assert stored(lote) == [("trigo", None, None)]

    def test_per_item_errors_use_nested_shape(self, auth_client):
        response = auth_client.post(
            URL,
            lote_payload(plantings=[{"crop": "soja"}, {"crop": "papa"}, {}]),
            format="json",
        )

        assert response.status_code == 400
        errors = response.json()["plantings"]
        assert len(errors) == 3
        assert errors[0] == {}
        assert list(errors[1]) == ["crop"]
        assert list(errors[2]) == ["crop"]
        assert not Lote.objects.exists()

    @pytest.mark.parametrize("crop", ["", None])
    def test_empty_crop_is_invalid(self, auth_client, crop):
        response = auth_client.post(URL, lote_payload(plantings=[{"crop": crop}]), format="json")

        assert response.status_code == 400
        assert list(response.json()["plantings"][0]) == ["crop"]
        assert not Lote.objects.exists()

    @pytest.mark.parametrize("area", [0, -1, "0.001"])
    def test_area_must_be_positive(self, auth_client, user, area):
        lote = make_lote(user)
        Planting.objects.create(lote=lote, crop="trigo")

        response = auth_client.patch(
            f"{URL}{lote.id}/",
            {"plantings": [{"crop": "soja", "area_ha": area}]},
            format="json",
        )

        assert response.status_code == 400
        assert list(response.json()["plantings"][0]) == ["area_ha"]
        assert stored(lote) == [("trigo", None, None)]

    def test_other_users_lote_is_untouched(self, auth_client, make_user):
        other = make_lote(make_user(email="otro@example.com"), name="Ajeno")
        Planting.objects.create(lote=other, crop="trigo")

        response = auth_client.patch(
            f"{URL}{other.id}/", {"plantings": [{"crop": "soja"}]}, format="json"
        )

        assert response.status_code == 404
        assert stored(other) == [("trigo", None, None)]

    def test_deleting_the_lote_deletes_its_plantings(self, auth_client, user):
        lote = make_lote(user)
        Planting.objects.create(lote=lote, crop="soja")

        assert auth_client.delete(f"{URL}{lote.id}/").status_code == 204
        assert not Planting.objects.exists()


BEFORE = [("lotes", "0001_initial")]


def migrate(targets):
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate(targets)
    return executor.loader.project_state(targets).apps


@pytest.mark.django_db(transaction=True)
def test_data_migration_moves_crops_both_ways(make_user):
    user = make_user()
    latest = MigrationExecutor(connection).loader.graph.leaf_nodes("lotes")
    try:
        old = migrate(BEFORE)
        OldLote = old.get_model("lotes", "Lote")
        sown = OldLote.objects.create(
            user_id=user.id,
            name="Sembrado",
            latitude=Decimal("-33"),
            longitude=Decimal("-61"),
            crop="soja",
            sowing_date=date(2026, 10, 20),
        )
        bare = OldLote.objects.create(
            user_id=user.id, name="Vacío", latitude=Decimal("-33"), longitude=Decimal("-61")
        )
        # A sowing date with no crop was allowed before: it is kept as "otro" (L5).
        dated = OldLote.objects.create(
            user_id=user.id,
            name="Solo fecha",
            latitude=Decimal("-33"),
            longitude=Decimal("-61"),
            crop="",
            sowing_date=date(2026, 9, 5),
        )

        new = migrate(latest)
        NewPlanting = new.get_model("lotes", "Planting")
        assert list(
            NewPlanting.objects.order_by("lote_id").values_list(
                "lote_id", "crop", "area_ha", "sowing_date"
            )
        ) == [
            (sown.id, "soja", None, date(2026, 10, 20)),
            (dated.id, "otro", None, date(2026, 9, 5)),
        ]

        # A second planting is dropped on the way back; the first one returns to the lote.
        NewPlanting.objects.create(lote_id=sown.id, crop="maiz", sowing_date=date(2026, 12, 1))
        back = migrate(BEFORE)
        BackLote = back.get_model("lotes", "Lote")
        assert BackLote.objects.get(id=sown.id).crop == "soja"
        assert BackLote.objects.get(id=sown.id).sowing_date == date(2026, 10, 20)
        assert BackLote.objects.get(id=bare.id).crop is None
        assert BackLote.objects.get(id=bare.id).sowing_date is None
    finally:
        migrate(latest)


@pytest.mark.django_db
def test_patch_item_without_crop_is_refused(auth_client, user):
    """Independent verification: a partial PATCH must still require each planting's crop."""
    lote = make_lote(user)
    Planting.objects.create(lote=lote, crop="soja")

    response = auth_client.patch(
        f"{URL}{lote.id}/", {"plantings": [{"crop": "maiz"}, {"area_ha": "5"}]}, format="json"
    )

    assert response.status_code == 400
    assert response.json() == {"plantings": [{}, {"crop": ["Este campo es requerido."]}]}
    assert stored(lote) == [("soja", None, None)]
