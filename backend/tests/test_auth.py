import pytest
from django.conf import settings

from apps.accounts.models import User

from .conftest import PASSWORD

pytestmark = pytest.mark.django_db

REGISTER = "/api/auth/register/"
LOGIN = "/api/auth/login/"
LOGOUT = "/api/auth/logout/"
ME = "/api/auth/me/"
CSRF = "/api/auth/csrf/"


def identity(body: dict) -> dict:
    """The account fields; plan and usage are covered in test_plans."""
    return {key: body[key] for key in ("id", "email", "name")}


def test_csrf_endpoint_returns_204_and_sets_readable_cookie(csrf_client):
    response = csrf_client.get(CSRF)

    assert response.status_code == 204
    cookie = response.cookies["csrftoken"]
    assert cookie.value
    assert not cookie["httponly"]


def test_register_creates_user_and_logs_in(api_client):
    response = api_client.post(
        REGISTER,
        {"email": "Pedro@Example.com", "password": PASSWORD, "name": "Pedro"},
        format="json",
    )

    assert response.status_code == 201
    user = User.objects.get()
    assert identity(response.json()) == {
        "id": user.id,
        "email": "pedro@example.com",
        "name": "Pedro",
    }
    assert user.check_password(PASSWORD)
    me = api_client.get(ME)
    assert me.status_code == 200
    assert me.json()["email"] == "pedro@example.com"


def test_register_rejects_duplicate_email_case_insensitive(api_client, user):
    response = api_client.post(
        REGISTER, {"email": "ANA@example.com", "password": PASSWORD, "name": "Otra"}, format="json"
    )

    assert response.status_code == 400
    assert response.json() == {"email": ["Ya existe una cuenta con este email."]}
    assert User.objects.count() == 1


def test_register_validates_fields_in_spanish(api_client):
    response = api_client.post(REGISTER, {"email": "no-es-email", "password": "123"}, format="json")

    assert response.status_code == 400
    body = response.json()
    assert set(body) == {"email", "name"}  # password checked only once the fields are valid
    assert body["name"] == ["Este campo es requerido."]
    assert User.objects.count() == 0


def test_register_rejects_weak_password(api_client):
    response = api_client.post(
        REGISTER, {"email": "a@b.com", "password": "12345678", "name": "Ana"}, format="json"
    )

    assert response.status_code == 400
    assert list(response.json()) == ["password"]
    assert User.objects.count() == 0


def test_login_returns_user(api_client, user):
    response = api_client.post(
        LOGIN, {"email": "ANA@example.com", "password": PASSWORD}, format="json"
    )

    assert response.status_code == 200
    assert identity(response.json()) == {"id": user.id, "email": "ana@example.com", "name": "Ana"}
    assert api_client.get(ME).status_code == 200


def test_login_bad_credentials(api_client, user):
    response = api_client.post(
        LOGIN, {"email": "ana@example.com", "password": "mala"}, format="json"
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Email o contraseña incorrectos."}
    assert api_client.get(ME).status_code == 403


def test_login_unknown_email_uses_same_message(api_client, db):
    response = api_client.post(
        LOGIN, {"email": "nadie@example.com", "password": PASSWORD}, format="json"
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Email o contraseña incorrectos."}


def test_login_missing_fields_returns_field_errors(api_client, db):
    response = api_client.post(LOGIN, {}, format="json")

    assert response.status_code == 400
    assert set(response.json()) == {"email", "password"}


def test_session_lasts_60_days_and_renews(api_client, user):
    login = api_client.post(LOGIN, {"email": user.email, "password": PASSWORD}, format="json")
    assert int(login.cookies["sessionid"]["max-age"]) == 60 * 24 * 60 * 60
    assert login.cookies["sessionid"]["httponly"]

    me = api_client.get(ME)

    assert me.status_code == 200
    assert int(me.cookies["sessionid"]["max-age"]) == 60 * 24 * 60 * 60
    assert settings.SESSION_SAVE_EVERY_REQUEST is True


def test_me_anonymous_is_403(api_client, db):
    response = api_client.get(ME)

    assert response.status_code == 403
    assert "detail" in response.json()


def test_logout_returns_204_and_ends_session(auth_client):
    response = auth_client.post(LOGOUT)

    assert response.status_code == 204
    assert auth_client.get(ME).status_code == 403


def test_logout_anonymous_is_also_204(api_client, db):
    assert api_client.post(LOGOUT).status_code == 204


class TestCsrf:
    CSRF_MESSAGE = "Token CSRF ausente o inválido. Recargue la página e intente de nuevo."

    def test_login_without_token_is_rejected(self, csrf_client, user):
        response = csrf_client.post(
            LOGIN, {"email": user.email, "password": PASSWORD}, format="json"
        )

        assert response.status_code == 403
        assert response.json() == {"detail": self.CSRF_MESSAGE}

    def test_register_without_token_is_rejected(self, csrf_client, db):
        response = csrf_client.post(
            REGISTER, {"email": "a@b.com", "password": PASSWORD, "name": "A"}, format="json"
        )

        assert response.status_code == 403
        assert User.objects.count() == 0

    def test_login_with_token_from_csrf_endpoint(self, csrf_client, user):
        token = csrf_client.get(CSRF).cookies["csrftoken"].value

        response = csrf_client.post(
            LOGIN,
            {"email": user.email, "password": PASSWORD},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )

        assert response.status_code == 200

    def test_authenticated_unsafe_request_needs_token(self, csrf_client, user):
        csrf_client.force_login(user)

        without = csrf_client.post(LOGOUT)
        assert without.status_code == 403
        assert without.json() == {"detail": self.CSRF_MESSAGE}

        token = csrf_client.get(CSRF).cookies["csrftoken"].value
        assert csrf_client.post(LOGOUT, HTTP_X_CSRFTOKEN=token).status_code == 204

    def test_safe_methods_do_not_need_token(self, csrf_client, user):
        csrf_client.force_login(user)

        assert csrf_client.get(ME).status_code == 200


class TestThrottling:
    def test_login_is_throttled(self, api_client, user):
        payload = {"email": user.email, "password": "mala"}
        statuses = [api_client.post(LOGIN, payload, format="json").status_code for _ in range(10)]
        assert statuses == [400] * 10

        response = api_client.post(LOGIN, payload, format="json")

        assert response.status_code == 429
        assert "detail" in response.json()

    def test_register_is_throttled(self, api_client, db):
        for i in range(10):
            api_client.post(
                REGISTER,
                {"email": f"u{i}@example.com", "password": PASSWORD, "name": "U"},
                format="json",
            )

        response = api_client.post(
            REGISTER,
            {"email": "late@example.com", "password": PASSWORD, "name": "U"},
            format="json",
        )

        assert response.status_code == 429
        assert not User.objects.filter(email="late@example.com").exists()
