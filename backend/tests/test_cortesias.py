"""Cortesías: a paid plan for free until a date, given by a super admin (odd/tasks/cortesias.md)."""

from datetime import UTC, datetime, timedelta

import httpx
import pytest
import respx
import time_machine
from django.core import mail

from apps.accounts.models import Courtesy, Plan, PlanChange, User
from apps.accounts.tasks import expire_trials
from apps.backoffice.models import BackofficeAction
from apps.payments import services
from apps.payments.models import ProviderSubscription
from apps.payments.providers.base import RemoteSubscription

from .conftest import PASSWORD
from .test_backoffice import ACCOUNTS, account, client_for
from .test_payments import API, SUBSCRIBE, preapproval

pytestmark = pytest.mark.django_db

# 09:00 in Buenos Aires: "today" is 2026-11-16 there, and a year ahead is 2027-11-16.
NOW = datetime(2026, 11, 16, 12, tzinfo=UTC)
GRANT = {"plan": "empresa", "hasta": "2026-12-31", "motivo": "Cliente de enganche"}
# The end of 2026-12-31 in Buenos Aires.
END = datetime(2027, 1, 1, 2, 59, 59, tzinfo=UTC)

SELF = "No podés darte una cortesía a vos mismo."
CAP = "Ya hay 20 cortesías activas. Revocá alguna antes de dar otra."
FOUNDER_HAS_PRODUCTOR = "La cuenta es founder: ya tiene Productor sin vencimiento."
PAYING = "La cuenta tiene una suscripción paga: cancelala primero."
NO_COURTESY = "La cuenta no tiene una cortesía activa."
USE_COURTESY = "Para dar un plan pago sin cobrar, usá una cortesía."


def url(user):
    return f"{ACCOUNTS}{user.pk}/cortesia/"


def grant(client, user, **overrides):
    return client.post(url(user), {**GRANT, **overrides}, format="json")


def subscription(user, status="authorized", next_payment_at=None, **fields):
    return ProviderSubscription.objects.create(
        user=user,
        plan_id="productor",
        provider="mercadopago",
        currency="ARS",
        amount=14900,
        external_id=fields.pop("external_id", "pre-1"),
        status=status,
        checkout_url="https://www.mercadopago.com.ar/subscriptions/checkout",
        next_payment_at=next_payment_at,
        **fields,
    )


def active_courtesy(user, plan="empresa", ends_at=END, starts_at=NOW, by=None, reason="Prueba"):
    """An account already on a cortesía, as a grant leaves it."""
    user.plan_id, user.plan_expires_at = plan, ends_at
    user.save(update_fields=["plan", "plan_expires_at"])
    return Courtesy.objects.create(
        user=user, plan_id=plan, reason=reason, starts_at=starts_at, ends_at=ends_at, granted_by=by
    )


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(email="jefe@example.com", password=PASSWORD, name="Jefe")


@pytest.fixture
def admin_client(admin_user):
    return client_for(admin_user)


@pytest.fixture(autouse=True)
def _frozen():
    with time_machine.travel(NOW, tick=False):
        yield


# --- S1: give a cortesía -------------------------------------------------------------------


class TestGrant:
    def test_moves_the_account_to_the_plan_free_until_the_end_of_that_day(
        self, admin_client, admin_user
    ):
        ana = account("ana@example.com")

        response = grant(admin_client, ana)

        assert response.status_code == 200
        body = response.json()
        assert body["plan"] == {"code": "empresa", "name": "Empresa"}
        assert body["plan_expires_at"] == "2026-12-31T23:59:59-03:00"
        assert body["courtesy"] == {
            "plan": {"code": "empresa", "name": "Empresa"},
            "starts_at": "2026-11-16T09:00:00-03:00",
            "ends_at": "2026-12-31T23:59:59-03:00",
            "reason": "Cliente de enganche",
            "granted_by": {"id": admin_user.pk, "name": "Jefe", "email": "jefe@example.com"},
        }
        ana.refresh_from_db()
        assert (ana.plan_id, ana.plan_expires_at) == ("empresa", END)
        change = PlanChange.objects.get(user=ana)
        assert (change.from_plan_id, change.to_plan_id, change.reason, change.by) == (
            "basico",
            "empresa",
            "courtesy",
            admin_user,
        )
        assert change.note == "Cliente de enganche"
        action = BackofficeAction.objects.get()
        assert (action.actor, action.action, action.target_user) == (
            admin_user,
            "courtesy_grant",
            ana,
        )
        assert action.payload == {
            "plan": "empresa",
            "until": "2026-12-31",
            "reason": "Cliente de enganche",
            "from_plan": "basico",
        }
        courtesy = Courtesy.objects.get()
        assert (courtesy.user, courtesy.plan_id, courtesy.ends_at, courtesy.ended_at) == (
            ana,
            "empresa",
            END,
            None,
        )
        assert mail.outbox == []

    def test_a_trial_on_productor_becomes_a_cortesia_on_productor(self, admin_client):
        ana = account("ana@example.com", plan_id="productor", plan_expires_at=NOW)

        response = grant(admin_client, ana, plan="productor")

        assert response.status_code == 200
        ana.refresh_from_db()
        assert (ana.plan_id, ana.plan_expires_at) == ("productor", END)
        change = PlanChange.objects.get(user=ana)
        assert (change.from_plan_id, change.to_plan_id, change.reason) == (
            "productor",
            "productor",
            "courtesy",
        )

    def test_a_founder_can_get_empresa(self, admin_client):
        founder = account("f@example.com", plan_id="productor", founder_number=3)

        response = grant(admin_client, founder)

        assert response.status_code == 200
        founder.refresh_from_db()
        assert (founder.plan_id, founder.plan_expires_at) == ("empresa", END)

    def test_one_year_ahead_is_the_last_day_allowed(self, admin_client):
        ana = account("ana@example.com")

        response = grant(admin_client, ana, hasta="2027-11-16")

        assert response.status_code == 200
        ana.refresh_from_db()
        assert ana.plan_expires_at == datetime(2027, 11, 17, 2, 59, 59, tzinfo=UTC)

    @pytest.mark.parametrize(
        ("body", "errors"),
        [
            ({"hasta": "2026-11-16"}, {"hasta": ["La fecha tiene que ser futura."]}),
            ({"hasta": "2026-11-01"}, {"hasta": ["La fecha tiene que ser futura."]}),
            (
                {"hasta": "2027-11-17"},
                {
                    "hasta": [
                        "La cortesía dura como máximo un año: elegí una fecha hasta el 16/11/2027."
                    ]
                },
            ),
            ({"plan": "basico"}, {"plan": ['"basico" no es una elección válida.']}),
            ({"plan": "oro"}, {"plan": ['"oro" no es una elección válida.']}),
            ({"motivo": ""}, {"motivo": ["Este campo no puede estar en blanco."]}),
            ({"motivo": "   "}, {"motivo": ["Este campo no puede estar en blanco."]}),
            (
                {"motivo": "x" * 201},
                {"motivo": ["Asegúrese de que este campo no tenga más de 200 caracteres."]},
            ),
        ],
    )
    def test_a_bad_field_is_a_400_and_changes_nothing(self, admin_client, body, errors):
        ana = account("ana@example.com")

        response = grant(admin_client, ana, **body)

        assert response.status_code == 400
        assert response.json() == errors
        self.assert_untouched(ana)

    def test_every_field_is_required(self, admin_client):
        ana = account("ana@example.com")

        response = admin_client.post(url(ana), {}, format="json")

        assert response.status_code == 400
        assert set(response.json()) == {"plan", "hasta", "motivo"}
        self.assert_untouched(ana)

    def test_refuses_the_super_admins_own_account(self, admin_client, admin_user):
        response = grant(admin_client, admin_user)

        assert response.status_code == 400
        assert response.json() == {"detail": SELF}
        self.assert_untouched(admin_user)

    def test_refuses_productor_for_a_founder(self, admin_client):
        founder = account("f@example.com", plan_id="productor", founder_number=3)

        response = grant(admin_client, founder, plan="productor")

        assert response.status_code == 400
        assert response.json() == {"detail": FOUNDER_HAS_PRODUCTOR}
        self.assert_untouched(founder, plan="productor")

    def test_refuses_an_account_with_a_running_subscription(self, admin_client):
        ana = account("ana@example.com", plan_id="productor")
        subscription(ana)

        response = grant(admin_client, ana)

        assert response.status_code == 400
        assert response.json() == {"detail": PAYING}
        self.assert_untouched(ana, plan="productor")

    def test_refuses_an_account_still_in_its_paid_month(self, admin_client):
        ana = account("ana@example.com", plan_id="productor")
        subscription(ana, status="cancelled", next_payment_at=NOW + timedelta(days=10))

        response = grant(admin_client, ana)

        assert response.status_code == 400
        assert response.json() == {
            "detail": "La cuenta tiene días pagos hasta el 26/11/2026: "
            "dale la prueba después de esa fecha."
        }
        self.assert_untouched(ana, plan="productor")

    def test_refuses_a_21st_active_cortesia(self, admin_client):
        for n in range(20):
            active_courtesy(account(f"c{n}@example.com"))
        Courtesy.objects.filter(user__email="c0@example.com").update(ended_at=NOW)
        active_courtesy(account("c20@example.com"))  # 20 active again
        ana = account("ana@example.com")

        response = grant(admin_client, ana)

        assert response.status_code == 400
        assert response.json() == {"detail": CAP}
        self.assert_untouched(ana)

    def test_an_ended_cortesia_does_not_count_for_the_cap(self, admin_client):
        for n in range(20):
            active_courtesy(account(f"c{n}@example.com"))
        Courtesy.objects.filter(user__email="c0@example.com").update(ended_at=NOW)
        ana = account("ana@example.com")

        assert grant(admin_client, ana).status_code == 200

    @staticmethod
    def assert_untouched(user, plan="basico"):
        user.refresh_from_db()
        assert (user.plan_id, user.plan_expires_at) == (plan, None)
        assert not PlanChange.objects.filter(user=user).exists()
        assert not Courtesy.objects.filter(user=user).exists()
        assert not BackofficeAction.objects.exists()


class TestGrantAgain:
    def test_changes_the_plan_and_the_date_of_the_active_cortesia(self, admin_client, admin_user):
        ana = account("ana@example.com")
        courtesy = active_courtesy(ana, plan="productor")

        response = grant(admin_client, ana, plan="empresa", hasta="2027-02-15", motivo="Otro")

        assert response.status_code == 200
        ana.refresh_from_db()
        new_end = datetime(2027, 2, 16, 2, 59, 59, tzinfo=UTC)
        assert (ana.plan_id, ana.plan_expires_at) == ("empresa", new_end)
        courtesy.refresh_from_db()
        assert (courtesy.plan_id, courtesy.ends_at, courtesy.reason) == ("empresa", new_end, "Otro")
        assert courtesy.starts_at == NOW
        assert Courtesy.objects.count() == 1
        change = PlanChange.objects.get(user=ana)
        assert (change.from_plan_id, change.to_plan_id, change.reason) == (
            "productor",
            "empresa",
            "courtesy",
        )
        assert BackofficeAction.objects.get().payload == {
            "plan": "empresa",
            "until": "2027-02-15",
            "reason": "Otro",
            "from_plan": "productor",
        }

    def test_only_a_new_date_records_no_plan_change(self, admin_client):
        ana = account("ana@example.com")
        active_courtesy(ana)

        response = grant(admin_client, ana, hasta="2027-03-01")

        assert response.status_code == 200
        ana.refresh_from_db()
        assert ana.plan_expires_at == datetime(2027, 3, 2, 2, 59, 59, tzinfo=UTC)
        assert not PlanChange.objects.filter(user=ana).exists()
        assert BackofficeAction.objects.get().action == "courtesy_grant"

    def test_never_ends_more_than_a_year_after_the_first_grant(self, admin_client):
        ana = account("ana@example.com")
        courtesy = active_courtesy(ana, starts_at=datetime(2026, 3, 1, 15, tzinfo=UTC))

        response = grant(admin_client, ana, hasta="2027-03-02")

        assert response.status_code == 400
        assert response.json() == {
            "detail": "La cortesía empezó el 01/03/2026: puede durar como máximo "
            "hasta el 01/03/2027."
        }
        ana.refresh_from_db()
        assert (ana.plan_id, ana.plan_expires_at) == ("empresa", END)
        courtesy.refresh_from_db()
        assert courtesy.ends_at == END
        assert not BackofficeAction.objects.exists()

        assert grant(admin_client, ana, hasta="2027-03-01").status_code == 200

    def test_does_not_count_for_the_cap(self, admin_client):
        for n in range(19):
            active_courtesy(account(f"c{n}@example.com"))
        ana = account("ana@example.com")
        active_courtesy(ana)

        assert grant(admin_client, ana, hasta="2027-01-31").status_code == 200


# --- S2: revoke ----------------------------------------------------------------------------


class TestRevoke:
    def test_ends_it_now_and_moves_the_account_to_basico(self, admin_client, admin_user):
        ana = account("ana@example.com")
        courtesy = active_courtesy(ana)

        response = admin_client.delete(url(ana))

        assert response.status_code == 200
        body = response.json()
        assert body["plan"] == {"code": "basico", "name": "Básico"}
        assert (body["plan_expires_at"], body["courtesy"]) == (None, None)
        ana.refresh_from_db()
        assert (ana.plan_id, ana.plan_expires_at) == ("basico", None)
        courtesy.refresh_from_db()
        assert courtesy.ended_at == NOW
        change = PlanChange.objects.get(user=ana)
        assert (change.from_plan_id, change.to_plan_id, change.reason, change.by) == (
            "empresa",
            "basico",
            "courtesy_ended",
            admin_user,
        )
        action = BackofficeAction.objects.get()
        assert (action.actor, action.action, action.target_user) == (
            admin_user,
            "courtesy_revoke",
            ana,
        )
        assert action.payload == {"plan": "empresa", "until": "2026-12-31", "to_plan": "basico"}
        assert mail.outbox == []

    def test_a_founder_goes_back_to_productor(self, admin_client):
        founder = account("f@example.com", founder_number=3)
        active_courtesy(founder)

        response = admin_client.delete(url(founder))

        assert response.status_code == 200
        founder.refresh_from_db()
        assert (founder.plan_id, founder.plan_expires_at) == ("productor", None)
        assert BackofficeAction.objects.get().payload["to_plan"] == "productor"

    def test_without_an_active_cortesia_is_a_404(self, admin_client):
        ana = account("ana@example.com", plan_id="productor")
        ended = active_courtesy(ana)
        Courtesy.objects.filter(pk=ended.pk).update(ended_at=NOW)

        response = admin_client.delete(url(ana))

        assert response.status_code == 404
        assert response.json() == {"detail": NO_COURTESY}
        ana.refresh_from_db()
        assert ana.plan_id == "empresa"
        assert not PlanChange.objects.exists()
        assert not BackofficeAction.objects.exists()


class TestSecurity:
    @pytest.mark.parametrize("method", ["post", "delete"])
    def test_a_non_superuser_is_refused(self, method):
        ana = account("ana@example.com")
        staff = account("staff@example.com", is_staff=True)

        response = getattr(client_for(staff), method)(url(ana), GRANT, format="json")

        assert response.status_code == 403
        ana.refresh_from_db()
        assert ana.plan_id == "basico"
        assert not Courtesy.objects.exists()
        assert not BackofficeAction.objects.exists()

    def test_a_non_superuser_cannot_give_themself_one(self):
        staff = account("staff@example.com", is_staff=True)

        response = client_for(staff).post(url(staff), GRANT, format="json")

        assert response.status_code == 403
        assert not Courtesy.objects.exists()

    @pytest.mark.parametrize("method", ["post", "delete"])
    def test_an_unknown_account_is_a_404(self, admin_client, method):
        response = getattr(admin_client, method)(
            f"{ACCOUNTS}999999/cortesia/", GRANT, format="json"
        )

        assert response.status_code == 404
        assert not BackofficeAction.objects.exists()


# --- S3: expiry, reminder and payment ------------------------------------------------------


class TestExpiry:
    def test_the_daily_task_ends_cortesias_whose_date_passed_and_emails_them(
        self, django_capture_on_commit_callbacks
    ):
        ana = account("ana@example.com", name="Ana")
        due = active_courtesy(ana, ends_at=NOW - timedelta(minutes=1))
        founder = account("f@example.com", founder_number=3)
        active_courtesy(founder, ends_at=NOW - timedelta(days=1))
        running = account("run@example.com")
        active_courtesy(running, ends_at=NOW + timedelta(days=30))

        with django_capture_on_commit_callbacks(execute=True):
            ended = expire_trials()

        assert ended == 2
        ana.refresh_from_db()
        founder.refresh_from_db()
        running.refresh_from_db()
        assert (ana.plan_id, ana.plan_expires_at) == ("basico", None)
        assert (founder.plan_id, founder.plan_expires_at) == ("productor", None)
        assert (running.plan_id, running.plan_expires_at) == ("empresa", NOW + timedelta(days=30))
        due.refresh_from_db()
        assert due.ended_at == NOW
        change = PlanChange.objects.get(user=ana)
        assert (change.from_plan_id, change.to_plan_id, change.reason, change.by) == (
            "empresa",
            "basico",
            "courtesy_ended",
            None,
        )
        ended_mails = {m.to[0]: m for m in mail.outbox}
        assert set(ended_mails) == {"ana@example.com", "f@example.com"}
        message = ended_mails["ana@example.com"]
        assert message.subject == "Terminó tu cortesía del plan Empresa"
        assert message.body == (
            "Hola Ana:\n\n"
            "Terminó tu cortesía del plan Empresa y tu cuenta pasó al plan Básico.\n"
            "Tus lotes y reglas siguen guardados, pero el plan Básico no envía notificaciones "
            "push y permite hasta 2 lotes y 3 reglas de alerta.\n\n"
            "Para seguir con el plan Empresa, suscribite en https://clima.example.com/planes\n\n"
            "Gaucho Weather"
        )
        assert "pasó al plan Productor" in ended_mails["f@example.com"].body

    def test_a_cortesia_on_productor_is_not_treated_as_a_trial(
        self, django_capture_on_commit_callbacks
    ):
        ana = account("ana@example.com")
        active_courtesy(ana, plan="productor", ends_at=NOW - timedelta(minutes=1))

        with django_capture_on_commit_callbacks(execute=True):
            assert expire_trials() == 1

        assert [m.subject for m in mail.outbox] == ["Terminó tu cortesía del plan Productor"]
        assert PlanChange.objects.get(user=ana).reason == "courtesy_ended"
        assert Courtesy.objects.get().ended_at == NOW

    def test_trials_still_expire_next_to_cortesias(self, django_capture_on_commit_callbacks):
        trial = account("t@example.com", plan_id="productor", plan_expires_at=NOW - timedelta(1))

        with django_capture_on_commit_callbacks(execute=True):
            assert expire_trials() == 1

        trial.refresh_from_db()
        assert trial.plan_id == "basico"
        assert PlanChange.objects.get(user=trial).reason == "trial_ended"
        assert [m.subject for m in mail.outbox] == ["Terminó tu prueba de Productor"]

    def test_is_idempotent(self, django_capture_on_commit_callbacks):
        active_courtesy(account("ana@example.com"), ends_at=NOW - timedelta(minutes=1))

        with django_capture_on_commit_callbacks(execute=True):
            expire_trials()
            again = expire_trials()

        assert again == 0
        assert len(mail.outbox) == 1
        assert PlanChange.objects.count() == 1


class TestReminder:
    def test_one_email_about_seven_days_before_the_end(self, django_capture_on_commit_callbacks):
        ana = account("ana@example.com", name="Ana")
        soon = active_courtesy(ana, ends_at=datetime(2026, 11, 23, 2, 59, 59, tzinfo=UTC))
        later = active_courtesy(account("b@example.com"), ends_at=NOW + timedelta(days=8))

        with django_capture_on_commit_callbacks(execute=True):
            expire_trials()
            expire_trials()

        assert len(mail.outbox) == 1
        message = mail.outbox[0]
        assert message.to == ["ana@example.com"]
        assert message.subject == "Tu cortesía del plan Empresa termina el 22/11/2026"
        assert message.body == (
            "Hola Ana:\n\n"
            "Tu cortesía del plan Empresa termina el 22/11/2026. Después tu cuenta pasa al "
            "plan Básico.\n\n"
            "Si querés seguir con el plan Empresa, podés suscribirte en "
            "https://clima.example.com/planes\n\n"
            "Gaucho Weather"
        )
        soon.refresh_from_db()
        later.refresh_from_db()
        assert soon.reminder_sent_at == NOW
        assert later.reminder_sent_at is None
        ana.refresh_from_db()
        assert ana.plan_id == "empresa"  # a reminder changes nothing else


class TestPayment:
    def test_an_authorized_subscription_ends_the_cortesia_without_moving_the_plan_twice(self):
        ana = account("ana@example.com")
        courtesy = active_courtesy(ana, plan="productor")
        subscription(ana, status="pending")

        services.sync_subscription(
            "mercadopago", RemoteSubscription("pre-1", "authorized", NOW + timedelta(days=30))
        )

        ana.refresh_from_db()
        assert (ana.plan_id, ana.plan_expires_at) == ("productor", None)
        courtesy.refresh_from_db()
        assert courtesy.ended_at == NOW
        change = PlanChange.objects.get(user=ana)
        assert (change.from_plan_id, change.to_plan_id, change.reason) == (
            "productor",
            "productor",
            "payment",
        )

    @respx.mock
    def test_a_founder_on_an_empresa_cortesia_can_subscribe_to_empresa(self, settings):
        settings.MERCADOPAGO_ACCESS_TOKEN = "TEST-access-token"
        settings.MERCADOPAGO_API_URL = API
        Plan.objects.filter(code=Plan.PRODUCTOR).update(price_ars_month=14900)
        Plan.objects.filter(code=Plan.EMPRESA).update(price_ars_month=49900)
        respx.post(f"{API}/preapproval").mock(
            return_value=httpx.Response(201, json=preapproval(amount=35000))
        )
        founder = account("f@example.com", founder_number=3)
        active_courtesy(founder)

        response = client_for(founder).post(
            SUBSCRIBE,
            {"plan": "empresa", "currency": "ARS", "acepta_terminos": True},
            format="json",
        )

        assert response.status_code == 201
        assert ProviderSubscription.objects.get().amount == 35000
        founder.refresh_from_db()
        assert (founder.plan_id, founder.plan_expires_at) == ("empresa", END)


# --- S4: the backoffice plan change only moves down ---------------------------------------


class TestPlanChangeIsClosed:
    @pytest.mark.parametrize("plan", ["productor", "empresa"])
    def test_a_paid_plan_is_refused(self, admin_client, plan):
        ana = account("ana@example.com")

        response = admin_client.post(f"{ACCOUNTS}{ana.pk}/plan/", {"plan": plan}, format="json")

        assert response.status_code == 400
        assert response.json() == {"detail": USE_COURTESY}
        ana.refresh_from_db()
        assert (ana.plan_id, ana.plan_expires_at) == ("basico", None)
        assert not PlanChange.objects.exists()
        assert not BackofficeAction.objects.exists()

    def test_moving_to_basico_ends_an_active_cortesia(self, admin_client, admin_user):
        ana = account("ana@example.com")
        courtesy = active_courtesy(ana)

        response = admin_client.post(
            f"{ACCOUNTS}{ana.pk}/plan/", {"plan": "basico", "note": "baja"}, format="json"
        )

        assert response.status_code == 200
        ana.refresh_from_db()
        assert (ana.plan_id, ana.plan_expires_at) == ("basico", None)
        courtesy.refresh_from_db()
        assert courtesy.ended_at == NOW
        change = PlanChange.objects.get(user=ana)
        assert (change.to_plan_id, change.reason, change.by) == ("basico", "staff", admin_user)
        assert BackofficeAction.objects.get().action == "plan_change"
