"""avisos-cambios S5: a terms version shipped before its date, and its notice email."""

from datetime import UTC, datetime

import pytest
import time_machine
from django.core import mail
from rest_framework.test import APIClient

from apps.accounts import tasks, terms
from apps.accounts.models import TermsAcceptance, TermsNotice, User

from .conftest import PASSWORD

pytestmark = pytest.mark.django_db

ME = "/api/auth/me/"
ACCEPT = "/api/auth/terminos/aceptar/"
REGISTER = "/api/auth/register/"
OLD, NEW = "2026-11-19", "2026-12-20"
BEFORE = datetime(2026, 11, 25, 12, tzinfo=UTC)
ON_ITS_DATE = datetime(2026, 12, 20, 3, 30, tzinfo=UTC)  # 00:30 in Buenos Aires
DAY_BEFORE_LATE = datetime(2026, 12, 20, 2, 30, tzinfo=UTC)  # still the 19th there


@pytest.fixture
def new_version_shipped(monkeypatch):
    """A release with NEW texts dated in the future; OLD is the version in force until then."""
    monkeypatch.setattr(terms, "TERMS_VERSION", NEW)
    monkeypatch.setattr(terms, "EARLIER_VERSIONS", (OLD,))


def client_for(user):
    client = APIClient()
    client.force_login(user)
    return client


def accepted(email, version=OLD, **fields):
    user = User.objects.create_user(email=email, password=PASSWORD, name=email.split("@")[0])
    if fields:
        User.objects.filter(pk=user.pk).update(**fields)
        user.refresh_from_db()
    TermsAcceptance.objects.create(user=user, version=version, context="signup")
    return user


def me_at(user, moment):
    with time_machine.travel(moment, tick=False):
        return client_for(user).get(ME).json()


# --- which version is in force -----------------------------------------------------------------


@pytest.mark.usefixtures("new_version_shipped")
def test_until_its_date_the_old_version_stays_in_force_and_no_dialog_shows():
    ana = accepted("ana@example.com")

    for moment in (BEFORE, DAY_BEFORE_LATE):
        body = me_at(ana, moment)
        assert (body["terms_version"], body["terms_accepted"]) == (OLD, True)


@pytest.mark.usefixtures("new_version_shipped")
def test_from_its_date_the_dialog_asks_for_the_new_version():
    ana = accepted("ana@example.com")

    body = me_at(ana, ON_ITS_DATE)

    assert (body["terms_version"], body["terms_accepted"]) == (NEW, False)
    with time_machine.travel(ON_ITS_DATE, tick=False):
        response = client_for(ana).post(ACCEPT)
    assert response.json()["terms_accepted"] is True
    assert set(ana.terms_acceptances.values_list("version", flat=True)) == {OLD, NEW}


@pytest.mark.usefixtures("new_version_shipped")
def test_signing_up_before_its_date_accepts_the_texts_shown_too():
    with time_machine.travel(BEFORE, tick=False):
        response = APIClient().post(
            REGISTER,
            {
                "email": "beto@example.com",
                "password": PASSWORD,
                "name": "Beto",
                "acepta_terminos": True,
            },
            format="json",
        )
    assert response.status_code == 201
    beto = User.objects.get(email="beto@example.com")
    assert sorted(beto.terms_acceptances.values_list("version", flat=True)) == [OLD, NEW]

    assert me_at(beto, ON_ITS_DATE)["terms_accepted"] is True


def test_with_a_single_version_it_is_always_in_force():
    ana = accepted("ana@example.com", version=terms.TERMS_VERSION)

    body = me_at(ana, BEFORE)

    assert (body["terms_version"], body["terms_accepted"]) == (terms.TERMS_VERSION, True)
    assert terms.upcoming_version() is None


# --- the notice email --------------------------------------------------------------------------


@pytest.mark.usefixtures("new_version_shipped")
def test_every_active_account_gets_one_notice_before_its_date():
    accepted("ana@example.com")
    accepted("beto@example.com")
    accepted("bloqueado@example.com", is_active=False)

    with time_machine.travel(BEFORE, tick=False):
        assert tasks.terms_notices() == 2
        assert tasks.terms_notices() == 0

    assert sorted(m.to[0] for m in mail.outbox) == ["ana@example.com", "beto@example.com"]
    assert set(TermsNotice.objects.values_list("version", flat=True)) == {NEW}
    assert all(n.sent_at == BEFORE for n in TermsNotice.objects.all())


@pytest.mark.usefixtures("new_version_shipped")
def test_the_notice_says_from_when_and_where_to_read_it():
    accepted("ana@example.com")

    with time_machine.travel(BEFORE, tick=False):
        tasks.terms_notices()

    [message] = mail.outbox
    assert message.subject == "Actualizamos los términos de Gaucho Weather"
    assert "Hola ana:" in message.body
    assert "rige desde el 20 de diciembre de 2026" in message.body
    for page in ("/terminos", "/privacidad", "/reglas"):
        assert page in message.body
    assert "te va a pedir que la aceptes" in message.body


@pytest.mark.usefixtures("new_version_shipped")
def test_no_notice_once_it_is_in_force():
    accepted("ana@example.com")

    with time_machine.travel(ON_ITS_DATE, tick=False):
        assert tasks.terms_notices() == 0

    assert mail.outbox == []


def test_no_notice_without_a_new_version():
    accepted("ana@example.com", version=terms.TERMS_VERSION)

    with time_machine.travel(BEFORE, tick=False):
        assert tasks.terms_notices() == 0

    assert mail.outbox == []


@pytest.mark.usefixtures("new_version_shipped")
def test_a_lost_email_is_retried_on_the_next_run(monkeypatch):
    accepted("ana@example.com")

    def broken(*args, **kwargs):
        raise ConnectionError("smtp down")

    monkeypatch.setattr(terms, "send_mail", broken)
    with time_machine.travel(BEFORE, tick=False):
        assert tasks.terms_notices() == 0
    assert TermsNotice.objects.filter(sent_at__isnull=False).count() == 0
    monkeypatch.setattr(terms, "send_mail", mail.send_mail)

    with time_machine.travel(BEFORE, tick=False):
        assert tasks.terms_notices() == 1

    assert len(mail.outbox) == 1
