import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.alerts.models import AlertRule

from .test_lotes import make_lote

pytestmark = pytest.mark.django_db

RULES = "/api/alertas/reglas/"
ME = "/api/auth/me/"


def client_for(user):
    client = APIClient()
    client.force_login(user)
    return client


def on_plan(user, code):
    User.objects.filter(pk=user.pk).update(plan_id=code)
    user.refresh_from_db()
    return user


def rule(lote, **fields):
    data = {"variable": "temp_min", "comparator": "lt", "threshold": 2}
    data.update(fields)
    return {"lote": lote.pk, **data}


def make_rule(user, lote, **fields):
    data = {"variable": "temp_min", "comparator": "lt", "threshold": 2}
    data.update(fields)
    return AlertRule.objects.create(user=user, lote=lote, **data)


class TestCreate:
    def test_creates_a_rule_on_an_own_lote_with_a_readable_description(self, user):
        lote = make_lote(user, name="Lote Norte")

        response = client_for(user).post(RULES, rule(lote, threshold=2.5), format="json")

        assert response.status_code == 201
        body = response.json()
        assert body["lote"] == lote.pk
        assert body["lote_name"] == "Lote Norte"
        assert (body["variable"], body["comparator"], body["threshold"]) == ("temp_min", "lt", 2.5)
        assert body["enabled"] is True
        assert body["paused_by_plan"] is False
        assert body["description"] == "Mínima menor a 2,5 °C en Lote Norte"
        assert AlertRule.objects.get().user == user

    @pytest.mark.parametrize(
        ("fields", "description"),
        [
            (
                {"variable": "frost", "comparator": "lte", "threshold": 0},
                "Helada en el suelo de 0 °C o menos en L",
            ),
            (
                {"variable": "temp_max", "comparator": "gte", "threshold": 35},
                "Máxima mayor o igual a 35 °C en L",
            ),
            (
                {"variable": "rain", "comparator": "gt", "threshold": 20},
                "Lluvia mayor a 20 mm en el día en L",
            ),
            (
                {"variable": "wind", "comparator": "gte", "threshold": 40},
                "Viento mayor o igual a 40 km/h en L",
            ),
            (
                {"variable": "spray_window", "comparator": None, "threshold": None},
                "Ventana para pulverizar en L",
            ),
        ],
    )
    def test_describes_every_variable(self, user, fields, description):
        lote = make_lote(user, name="L")

        response = client_for(user).post(RULES, rule(lote, **fields), format="json")

        assert response.status_code == 201, response.json()
        assert response.json()["description"] == description

    def test_refuses_another_users_lote(self, user, make_user):
        foreign = make_lote(make_user(email="beto@example.com"))

        response = client_for(user).post(RULES, rule(foreign), format="json")

        assert response.status_code == 400
        assert response.json() == {"lote": ["Elegí uno de tus lotes."]}

    @pytest.mark.parametrize(
        ("fields", "errors"),
        [
            ({"comparator": None}, {"comparator": ["Elegí cómo comparar."]}),
            ({"threshold": None}, {"threshold": ["Poné un valor."]}),
            ({"threshold": 80}, {"threshold": ["Usá un valor entre -30 y 50 °C."]}),
            (
                {"variable": "rain", "comparator": "lt"},
                {"comparator": ["Para lluvia usá «mayor a» o «mayor o igual a»."]},
            ),
            (
                {"variable": "wind", "threshold": -1, "comparator": "gt"},
                {"threshold": ["Usá un valor entre 0 y 200 km/h."]},
            ),
            (
                {"variable": "frost", "comparator": "gt"},
                {"comparator": ["Para helada usá «menor a» o «menor o igual a»."]},
            ),
            (
                {"variable": "spray_window", "comparator": "gt", "threshold": 3},
                {"threshold": ["La ventana de pulverización no lleva valor."]},
            ),
            ({"variable": "granizo"}, {"variable": ['"granizo" no es una elección válida.']}),
        ],
    )
    def test_validates_each_variable_in_spanish(self, user, fields, errors):
        lote = make_lote(user)

        response = client_for(user).post(RULES, rule(lote, **fields), format="json")

        assert response.status_code == 400
        assert response.json() == errors
        assert not AlertRule.objects.exists()


class TestLimit:
    def test_basico_allows_three_rules_and_refuses_the_fourth_with_402(self, user):
        lote = make_lote(user)
        client = client_for(user)
        for _ in range(3):
            assert client.post(RULES, rule(lote), format="json").status_code == 201

        response = client.post(RULES, rule(lote), format="json")

        assert response.status_code == 402
        assert response.json() == {
            "detail": (
                "Tu plan Básico permite hasta 3 reglas de alerta. Mirá los planes para sumar más."
            ),
            "code": "plan_limit",
        }

    def test_productor_has_no_rule_limit(self, user):
        on_plan(user, "productor")
        lote = make_lote(user)
        for _ in range(10):
            make_rule(user, lote)

        assert client_for(user).post(RULES, rule(lote), format="json").status_code == 201

    def test_after_a_downgrade_the_newest_rules_pause(self, user):
        lote = make_lote(user)
        rules = [make_rule(user, lote, threshold=t) for t in range(5)]

        body = client_for(user).get(RULES).json()

        paused = {item["id"]: item["paused_by_plan"] for item in body}
        assert paused == {r.pk: index >= 3 for index, r in enumerate(rules)}

    def test_usage_counts_rules(self, user):
        lote = make_lote(user)
        make_rule(user, lote)

        assert client_for(user).get(ME).json()["usage"] == {"lotes": 1, "alert_rules": 1}


class TestManage:
    def test_lists_only_own_rules(self, user, make_user):
        other = make_user(email="beto@example.com")
        make_rule(other, make_lote(other))
        mine = make_rule(user, make_lote(user))

        body = client_for(user).get(RULES).json()

        assert [item["id"] for item in body] == [mine.pk]

    def test_pauses_and_edits_a_rule(self, user):
        lote = make_lote(user)
        existing = make_rule(user, lote)
        client = client_for(user)

        response = client.patch(
            f"{RULES}{existing.pk}/", {"enabled": False, "threshold": 0}, format="json"
        )

        assert response.status_code == 200
        existing.refresh_from_db()
        assert (existing.enabled, float(existing.threshold)) == (False, 0.0)

    def test_an_edit_is_validated_against_the_whole_rule(self, user):
        existing = make_rule(user, make_lote(user))

        response = client_for(user).patch(
            f"{RULES}{existing.pk}/", {"variable": "rain"}, format="json"
        )

        assert response.status_code == 400
        assert response.json() == {"comparator": ["Para lluvia usá «mayor a» o «mayor o igual a»."]}

    def test_deletes_a_rule(self, user):
        existing = make_rule(user, make_lote(user))

        response = client_for(user).delete(f"{RULES}{existing.pk}/")

        assert response.status_code == 204
        assert not AlertRule.objects.exists()

    def test_another_users_rule_is_404(self, user, make_user):
        other = make_user(email="beto@example.com")
        theirs = make_rule(other, make_lote(other))
        client = client_for(user)

        assert client.get(f"{RULES}{theirs.pk}/").status_code == 404
        assert (
            client.patch(f"{RULES}{theirs.pk}/", {"enabled": False}, format="json").status_code
            == 404
        )
        assert client.delete(f"{RULES}{theirs.pk}/").status_code == 404

    def test_deleting_a_lote_deletes_its_rules(self, user):
        lote = make_lote(user)
        make_rule(user, lote)

        client_for(user).delete(f"/api/lotes/{lote.pk}/")

        assert not AlertRule.objects.exists()

    def test_needs_a_session(self, api_client):
        assert api_client.get(RULES).status_code == 403
