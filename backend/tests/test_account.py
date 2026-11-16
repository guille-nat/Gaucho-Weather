import pytest
from rest_framework.test import APIClient

from apps.accounts.models import FounderProgram, User
from apps.lotes.models import Lote

from .conftest import PASSWORD
from .test_lotes import make_lote

pytestmark = pytest.mark.django_db

ME = "/api/auth/me/"
CHANGE_PASSWORD = "/api/auth/password/change/"
NEW_PASSWORD = "otra-clave-del-campo-27"
WRONG = {"current_password": ["La contraseña no es correcta."]}


def client_for(user):
    client = APIClient()
    client.force_login(user)
    return client


class TestEditAccount:
    def test_renames_the_account(self, auth_client, user):
        response = auth_client.patch(ME, {"name": "Ana María"}, format="json")

        assert response.status_code == 200
        assert response.json()["name"] == "Ana María"
        user.refresh_from_db()
        assert user.name == "Ana María"

    def test_rejects_a_blank_name(self, auth_client):
        response = auth_client.patch(ME, {"name": "  "}, format="json")

        assert response.status_code == 400
        assert response.json() == {"name": ["Este campo no puede estar en blanco."]}

    def test_changes_the_email_with_the_current_password(self, auth_client, user):
        response = auth_client.patch(
            ME, {"email": "Ana.Nueva@Example.com", "current_password": PASSWORD}, format="json"
        )

        assert response.status_code == 200
        assert response.json()["email"] == "ana.nueva@example.com"
        user.refresh_from_db()
        assert user.email == "ana.nueva@example.com"

    def test_changing_the_email_needs_the_password(self, auth_client, user):
        response = auth_client.patch(ME, {"email": "otra@example.com"}, format="json")

        assert response.status_code == 400
        assert response.json() == {
            "current_password": ["Para cambiar el email confirmá tu contraseña."]
        }
        user.refresh_from_db()
        assert user.email == "ana@example.com"

    def test_changing_the_email_with_a_wrong_password_is_refused(self, auth_client, user):
        response = auth_client.patch(
            ME, {"email": "otra@example.com", "current_password": "nope"}, format="json"
        )

        assert response.status_code == 400
        assert response.json() == WRONG
        user.refresh_from_db()
        assert user.email == "ana@example.com"

    def test_the_new_email_must_be_free(self, auth_client, make_user):
        make_user(email="beto@example.com")

        response = auth_client.patch(
            ME, {"email": "BETO@example.com", "current_password": PASSWORD}, format="json"
        )

        assert response.status_code == 400
        assert response.json() == {"email": ["Ya existe una cuenta con este email."]}

    def test_keeping_the_same_email_needs_no_password(self, auth_client):
        response = auth_client.patch(ME, {"email": "ana@example.com", "name": "Ana"}, format="json")

        assert response.status_code == 200

    def test_sets_notification_preferences(self, auth_client, user):
        response = auth_client.patch(
            ME, {"notify_push": False, "notify_email": False}, format="json"
        )

        assert response.status_code == 200
        assert (response.json()["notify_push"], response.json()["notify_email"]) == (False, False)
        user.refresh_from_db()
        assert (user.notify_push, user.notify_email) == (False, False)

    def test_plan_and_founder_fields_are_read_only(self, auth_client, user):
        response = auth_client.patch(
            ME,
            {"plan": "empresa", "founder_number": 1, "plan_expires_at": None},
            format="json",
        )

        assert response.status_code == 200
        user.refresh_from_db()
        assert (user.plan_id, user.founder_number) == ("basico", None)

    def test_needs_a_session(self, api_client):
        assert api_client.patch(ME, {"name": "X"}, format="json").status_code == 403


class TestChangePassword:
    def test_changes_it_and_keeps_the_session(self, auth_client, user):
        response = auth_client.post(
            CHANGE_PASSWORD,
            {"current_password": PASSWORD, "new_password": NEW_PASSWORD},
            format="json",
        )

        assert response.status_code == 204
        user.refresh_from_db()
        assert user.check_password(NEW_PASSWORD)
        assert auth_client.get(ME).status_code == 200

    def test_needs_the_current_password(self, auth_client, user):
        response = auth_client.post(
            CHANGE_PASSWORD,
            {"current_password": "nope", "new_password": NEW_PASSWORD},
            format="json",
        )

        assert response.status_code == 400
        assert response.json() == WRONG
        user.refresh_from_db()
        assert user.check_password(PASSWORD)

    def test_validates_the_new_password_in_spanish(self, auth_client, user):
        response = auth_client.post(
            CHANGE_PASSWORD, {"current_password": PASSWORD, "new_password": "123"}, format="json"
        )

        assert response.status_code == 400
        assert "new_password" in response.json()
        assert any("corta" in message for message in response.json()["new_password"])
        user.refresh_from_db()
        assert user.check_password(PASSWORD)

    def test_signs_out_the_other_sessions(self, user):
        here, elsewhere = client_for(user), client_for(user)

        here.post(
            CHANGE_PASSWORD,
            {"current_password": PASSWORD, "new_password": NEW_PASSWORD},
            format="json",
        )

        assert here.get(ME).status_code == 200
        assert elsewhere.get(ME).status_code == 403


class TestDeleteAccount:
    def test_deletes_the_account_and_its_lotes_and_signs_out(self, auth_client, user, make_user):
        make_lote(user)
        other = make_user(email="beto@example.com")
        make_lote(other)

        response = auth_client.delete(ME, {"password": PASSWORD}, format="json")

        assert response.status_code == 204
        assert not User.objects.filter(pk=user.pk).exists()
        assert list(Lote.objects.values_list("user_id", flat=True)) == [other.pk]
        assert auth_client.get(ME).status_code == 403

    def test_needs_the_password(self, auth_client, user):
        response = auth_client.delete(ME, {"password": "nope"}, format="json")

        assert response.status_code == 400
        assert response.json() == {"password": ["La contraseña no es correcta."]}
        assert User.objects.filter(pk=user.pk).exists()

    def test_a_founder_slot_is_not_freed(self, api_client):
        api_client.post(
            "/api/auth/register/",
            {"email": "f@example.com", "password": PASSWORD, "name": "F"},
            format="json",
        )

        api_client.delete(ME, {"password": PASSWORD}, format="json")

        assert FounderProgram.objects.get().next_number == 2


class TestThrottle:
    def test_password_checks_share_the_login_limit_per_ip(self, auth_client):
        bad = {"current_password": "nope", "new_password": NEW_PASSWORD}
        codes = [
            auth_client.post(CHANGE_PASSWORD, bad, format="json").status_code for _ in range(10)
        ]
        assert codes == [400] * 10

        response = auth_client.delete(ME, {"password": "nope"}, format="json")

        assert response.status_code == 429

    def test_reading_the_account_is_not_throttled(self, auth_client):
        codes = {auth_client.get(ME).status_code for _ in range(12)}

        assert codes == {200}
