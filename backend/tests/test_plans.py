import importlib
import threading
from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from django.apps import apps as django_apps
from django.core import mail
from django.db import close_old_connections, connection, transaction
from rest_framework.test import APIClient

from apps.accounts import plans
from apps.accounts.models import FounderProgram, Plan, User

from .conftest import PASSWORD
from .test_lotes import make_lote

pytestmark = pytest.mark.django_db

REGISTER = "/api/auth/register/"
ME = "/api/auth/me/"
PLANS = "/api/planes/"
NOW = datetime(2026, 11, 16, 12, tzinfo=UTC)


def register(client, email):
    response = client.post(
        REGISTER, {"email": email, "password": PASSWORD, "name": "Ana"}, format="json"
    )
    assert response.status_code == 201
    return User.objects.get(email=email)


def set_founder_limit(limit):
    FounderProgram.objects.filter(pk=1).update(limit=limit)


def test_three_plans_are_seeded_with_the_middle_one_highlighted():
    rows = list(Plan.objects.values_list("code", "max_lotes", "max_alert_rules", "allows_push"))

    assert rows == [
        ("basico", 2, 3, False),
        ("productor", 15, None, True),
        ("empresa", None, None, True),
    ]
    assert list(Plan.objects.filter(highlighted=True).values_list("code", flat=True)) == [
        "productor"
    ]
    assert Plan.objects.get(code="empresa").priority_support


def test_first_signups_are_founders_on_productor_forever(api_client):
    first = register(api_client, "uno@example.com")
    second = register(api_client, "dos@example.com")

    assert (first.founder_number, second.founder_number) == (1, 2)
    assert first.plan_id == second.plan_id == "productor"
    assert first.plan_expires_at is None and second.plan_expires_at is None
    assert first.is_founder
    assert FounderProgram.objects.get().next_number == 3


@time_machine.travel(NOW, tick=False)
def test_signup_after_the_founder_limit_gets_a_30_day_productor_trial(api_client):
    set_founder_limit(1)
    register(api_client, "founder@example.com")

    late = register(api_client, "tarde@example.com")

    assert late.founder_number is None
    assert late.plan_id == "productor"
    assert late.plan_expires_at == NOW + timedelta(days=30)


def test_a_deleted_founder_never_frees_its_slot(api_client):
    set_founder_limit(2)
    register(api_client, "uno@example.com").delete()

    second = register(api_client, "dos@example.com")
    third = register(api_client, "tres@example.com")

    assert second.founder_number == 2
    assert third.founder_number is None and third.plan_expires_at is not None


def test_a_superuser_takes_no_founder_slot():
    admin = User.objects.create_superuser(email="admin@example.com", password=PASSWORD, name="A")

    assert admin.plan_id == "basico"
    assert admin.founder_number is None
    assert FounderProgram.objects.get().next_number == 1


@pytest.mark.django_db(transaction=True)
def test_concurrent_signups_never_hand_out_more_founder_slots_than_the_limit():
    set_founder_limit(3)
    signups = 8
    barrier = threading.Barrier(signups)
    errors = []

    def sign_up(index):
        try:
            barrier.wait()
            with transaction.atomic():
                user = User.objects.create_user(
                    email=f"u{index}@example.com", password=PASSWORD, name="U"
                )
                plans.start_membership(user)
        except Exception as exc:  # surfaced below; a thread cannot fail the test itself
            errors.append(exc)
        finally:
            connection.close()

    threads = [threading.Thread(target=sign_up, args=(i,)) for i in range(signups)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    close_old_connections()

    assert errors == []
    numbers = sorted(
        User.objects.exclude(founder_number=None).values_list("founder_number", flat=True)
    )
    assert numbers == [1, 2, 3]
    assert User.objects.filter(founder_number=None, plan_expires_at__isnull=False).count() == 5
    assert FounderProgram.objects.get().next_number == 4


class TestExpireTrials:
    def make_trial(self, email, expires_at):
        return User.objects.create_user(
            email=email,
            password=PASSWORD,
            name="Ana",
            plan_id="productor",
            plan_expires_at=expires_at,
        )

    @time_machine.travel(NOW, tick=False)
    def test_moves_expired_trials_to_basico_and_emails_the_user(
        self, django_capture_on_commit_callbacks
    ):
        expired = self.make_trial("vencida@example.com", NOW - timedelta(minutes=1))
        running = self.make_trial("vigente@example.com", NOW + timedelta(days=3))
        founder = User.objects.create_user(
            email="founder@example.com",
            password=PASSWORD,
            name="F",
            plan_id="productor",
            founder_number=1,
        )

        with django_capture_on_commit_callbacks(execute=True):
            moved = plans.expire_trials()

        assert moved == 1
        expired.refresh_from_db()
        running.refresh_from_db()
        founder.refresh_from_db()
        assert (expired.plan_id, expired.plan_expires_at) == ("basico", None)
        assert running.plan_id == "productor"
        assert founder.plan_id == "productor"
        assert len(mail.outbox) == 1
        message = mail.outbox[0]
        assert message.to == ["vencida@example.com"]
        assert message.subject == "Terminó tu prueba de Productor"
        assert "https://clima.example.com/planes" in message.body
        assert "no envía notificaciones push y permite hasta 2 lotes y 3 reglas" in message.body

    @time_machine.travel(NOW, tick=False)
    def test_leaves_an_expiry_staff_set_on_another_plan_alone(self):
        empresa = self.make_trial("empresa@example.com", NOW - timedelta(days=1))
        User.objects.filter(pk=empresa.pk).update(plan_id="empresa")

        assert plans.expire_trials() == 0
        empresa.refresh_from_db()
        assert empresa.plan_id == "empresa"

    @time_machine.travel(NOW, tick=False)
    def test_is_idempotent(self, django_capture_on_commit_callbacks):
        self.make_trial("vencida@example.com", NOW - timedelta(days=1))

        with django_capture_on_commit_callbacks(execute=True):
            plans.expire_trials()
            again = plans.expire_trials()

        assert again == 0
        assert len(mail.outbox) == 1


def test_me_reports_plan_usage_founder_number_and_preferences(api_client):
    user = register(api_client, "ana@example.com")
    make_lote(user)

    body = api_client.get(ME).json()

    assert body["plan"] == {
        "code": "productor",
        "name": "Productor",
        "price_ars_month": None,
        "max_lotes": 15,
        "max_alert_rules": None,
        "allows_push": True,
        "priority_support": False,
        "highlighted": True,
    }
    assert body["founder_number"] == 1
    assert body["plan_expires_at"] is None
    assert body["usage"] == {"lotes": 1, "alert_rules": 0}
    assert (body["notify_push"], body["notify_email"]) == (True, True)


def test_plans_endpoint_is_public_and_counts_founder_slots_left(api_client):
    register(api_client, "uno@example.com")
    anonymous = type(api_client)()

    response = anonymous.get(PLANS)

    assert response.status_code == 200
    body = response.json()
    assert [plan["code"] for plan in body["plans"]] == ["basico", "productor", "empresa"]
    assert [plan["highlighted"] for plan in body["plans"]] == [False, True, False]
    assert body["founders"] == {"limit": 100, "remaining": 99}
    assert body["trial_days"] == 30


def test_backfill_makes_existing_accounts_founders_oldest_first(make_user):
    backfill = importlib.import_module("apps.accounts.migrations.0005_backfill_founders").backfill
    set_founder_limit(2)
    staff = User.objects.create_superuser(email="staff@example.com", password=PASSWORD, name="S")
    newest = make_user(email="nuevo@example.com")
    oldest = make_user(email="viejo@example.com")
    middle = make_user(email="medio@example.com")
    for offset, user in enumerate([oldest, middle, newest]):
        User.objects.filter(pk=user.pk).update(date_joined=NOW + timedelta(days=offset))

    backfill(django_apps, None)

    for user in (staff, oldest, middle, newest):
        user.refresh_from_db()
    assert (oldest.founder_number, middle.founder_number) == (1, 2)
    assert oldest.plan_id == middle.plan_id == "productor"
    assert newest.founder_number is None
    assert newest.plan_id == "productor" and newest.plan_expires_at is not None
    assert (staff.plan_id, staff.founder_number) == ("basico", None)
    assert FounderProgram.objects.get().next_number == 3


LOTES = "/api/lotes/"
LOTE = {"name": "Lote", "latitude": -33.04, "longitude": -61.06}
LIMIT_BASICO = {
    "detail": "Tu plan Básico permite hasta 2 lotes. Mirá los planes para sumar más.",
    "code": "plan_limit",
}


def client_for(user):
    client = APIClient()
    client.force_login(user)
    return client


class TestLoteLimit:
    def test_basico_creates_two_lotes_and_the_third_is_refused_with_402(self, user):
        client = client_for(user)
        for _ in range(2):
            assert client.post(LOTES, LOTE, format="json").status_code == 201

        response = client.post(LOTES, LOTE, format="json")

        assert response.status_code == 402
        assert response.json() == LIMIT_BASICO
        assert user.lotes.count() == 2

    def test_productor_allows_fifteen_lotes(self, user):
        User.objects.filter(pk=user.pk).update(plan_id="productor")
        for _ in range(14):
            make_lote(user)
        client = client_for(user)

        assert client.post(LOTES, LOTE, format="json").status_code == 201
        response = client.post(LOTES, LOTE, format="json")

        assert response.status_code == 402
        assert response.json()["detail"] == (
            "Tu plan Productor permite hasta 15 lotes. Mirá los planes para sumar más."
        )

    def test_empresa_has_no_lote_limit(self, user):
        User.objects.filter(pk=user.pk).update(plan_id="empresa")
        for _ in range(20):
            make_lote(user)

        response = client_for(user).post(LOTES, LOTE, format="json")

        assert response.status_code == 201

    def test_other_users_lotes_do_not_count(self, user, make_user):
        other = make_user(email="otro@example.com")
        for _ in range(2):
            make_lote(other)

        assert client_for(user).post(LOTES, LOTE, format="json").status_code == 201

    def test_a_downgraded_account_keeps_and_edits_its_lotes(self, user):
        lotes = [make_lote(user) for _ in range(4)]  # created while on a bigger plan
        client = client_for(user)

        listed = client.get(LOTES)
        edited = client.patch(f"{LOTES}{lotes[0].pk}/", {"name": "Norte"}, format="json")
        created = client.post(LOTES, LOTE, format="json")

        assert listed.status_code == 200 and len(listed.json()) == 4
        assert edited.status_code == 200
        assert created.status_code == 402
