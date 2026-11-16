import re
from datetime import timedelta

import pytest
import time_machine
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from .conftest import PASSWORD

pytestmark = pytest.mark.django_db

RESET = "/api/auth/password/reset/"
CONFIRM = "/api/auth/password/reset/confirm/"
LOGIN = "/api/auth/login/"
ME = "/api/auth/me/"
NEW_PASSWORD = "otra-clave-del-campo-27"
BAD_LINK = {"detail": "El enlace no es válido o venció. Pedí uno nuevo."}
LINK = re.compile(r"https://clima\.example\.com/restablecer/(?P<uid>[\w-]+)/(?P<token>[\w-]+)")


def request_reset(client, email):
    return client.post(RESET, {"email": email}, format="json")


def link_parts():
    assert len(mail.outbox) == 1
    match = LINK.search(mail.outbox[0].body)
    assert match, mail.outbox[0].body
    return match["uid"], match["token"]


def confirm(client, uid, token, password=NEW_PASSWORD):
    return client.post(
        CONFIRM, {"uid": uid, "token": token, "new_password": password}, format="json"
    )


def can_log_in(email, password):
    response = APIClient().post(LOGIN, {"email": email, "password": password}, format="json")
    return response.status_code == 200


def test_sends_a_link_that_sets_a_new_password(api_client, user):
    response = request_reset(api_client, "ANA@example.com")

    assert response.status_code == 204
    message = mail.outbox[0]
    assert message.to == ["ana@example.com"]
    assert message.subject == "Restablecé tu contraseña de Gaucho Weather"
    assert "vence en 1 hora" in message.body
    uid, token = link_parts()

    assert confirm(api_client, uid, token).status_code == 204
    assert can_log_in("ana@example.com", NEW_PASSWORD)
    assert not can_log_in("ana@example.com", PASSWORD)


def test_answers_the_same_for_an_unknown_email_and_sends_nothing(api_client, user):
    response = request_reset(api_client, "nadie@example.com")

    assert response.status_code == 204
    assert mail.outbox == []


def test_sends_nothing_to_a_deactivated_account(api_client, user):
    user.is_active = False
    user.save()

    assert request_reset(api_client, user.email).status_code == 204
    assert mail.outbox == []


def test_a_link_works_only_once(api_client, user):
    request_reset(api_client, user.email)
    uid, token = link_parts()
    confirm(api_client, uid, token)

    response = confirm(api_client, uid, token, password="tercera-clave-2026")

    assert response.status_code == 400
    assert response.json() == BAD_LINK
    assert can_log_in(user.email, NEW_PASSWORD)


def test_a_link_expires_after_one_hour(api_client, user):
    request_reset(api_client, user.email)
    uid, token = link_parts()

    with time_machine.travel(timezone.now() + timedelta(hours=1, minutes=1)):
        response = confirm(api_client, uid, token)

    assert response.status_code == 400
    assert response.json() == BAD_LINK
    assert can_log_in(user.email, PASSWORD)


def test_a_made_up_link_is_refused(api_client, user):
    assert confirm(api_client, "MQ", "abc-123").json() == BAD_LINK
    assert confirm(api_client, "no-es-base64!", "abc-123").status_code == 400


def test_validates_the_new_password_and_keeps_the_old_one(api_client, user):
    request_reset(api_client, user.email)
    uid, token = link_parts()

    response = confirm(api_client, uid, token, password="123")

    assert response.status_code == 400
    assert "new_password" in response.json()
    user.refresh_from_db()  # not by logging in: a login spends every pending reset link
    assert user.check_password(PASSWORD)
    assert confirm(api_client, uid, token).status_code == 204  # the link still works


def test_signs_out_every_session_of_the_account(api_client, auth_client, user):
    request_reset(api_client, user.email)
    uid, token = link_parts()

    confirm(api_client, uid, token)

    assert auth_client.get(ME).status_code == 403


def test_requests_are_throttled_per_ip(api_client, user):
    codes = [request_reset(api_client, f"u{i}@example.com").status_code for i in range(6)]

    assert codes == [204] * 5 + [429]


def test_one_address_gets_at_most_one_email_every_ten_minutes(user):
    # From different IPs, so only the per-address cooldown can hold them back.
    first, second, later = APIClient(), APIClient(REMOTE_ADDR="10.0.0.2"), APIClient()

    assert request_reset(first, user.email).status_code == 204
    assert request_reset(second, "ANA@example.com").status_code == 204
    assert len(mail.outbox) == 1

    with time_machine.travel(timezone.now() + timedelta(minutes=11)):
        request_reset(later, user.email)

    assert len(mail.outbox) == 2


def test_answers_204_even_when_the_queue_is_down(api_client, user, monkeypatch, caplog):
    from kombu.exceptions import OperationalError

    from apps.accounts import tasks

    def broker_down(*args, **kwargs):
        raise OperationalError("Connection refused")

    monkeypatch.setattr(tasks.send_password_reset, "delay", broker_down)

    response = request_reset(api_client, user.email)

    assert response.status_code == 204
    assert "Could not queue the password reset email" in caplog.text


def test_needs_the_csrf_token(csrf_client, user):
    response = csrf_client.post(RESET, {"email": user.email}, format="json")

    assert response.status_code == 403
    assert mail.outbox == []


def test_signing_in_spends_a_pending_link(api_client, user):
    request_reset(api_client, user.email)
    uid, token = link_parts()

    assert can_log_in(user.email, PASSWORD)  # remembered the password after all

    assert confirm(api_client, uid, token).json() == BAD_LINK
