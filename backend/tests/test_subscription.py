"""S14: my subscription — status, usage, plan history and change/cancel requests."""

import importlib
from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from django.apps import apps as django_apps
from django.core import mail
from django.forms import MultiWidget
from rest_framework.test import APIClient

from apps.accounts import plans
from apps.accounts.models import FounderProgram, PlanChange, PlanRequest, User

from .conftest import PASSWORD
from .test_lotes import make_lote

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 11, 16, 12, tzinfo=UTC)
SUBSCRIPTION = "/api/auth/suscripcion/"
REQUEST = "/api/auth/suscripcion/pedido/"
REGISTER = "/api/auth/register/"
ADMIN_REQUESTS = "/api/admin/accounts/planrequest/"


def client_for(user):
    client = APIClient()
    client.force_login(user)
    return client


def register(email):
    response = APIClient().post(
        REGISTER,
        {"email": email, "password": PASSWORD, "name": "Ana", "acepta_terminos": True},
        format="json",
    )
    assert response.status_code == 201
    return User.objects.get(email=email)


def history_of(user):
    return list(
        PlanChange.objects.filter(user=user)
        .order_by("at", "id")
        .values_list("from_plan_id", "to_plan_id", "reason")
    )


@pytest.fixture
def staff(make_user):
    return User.objects.create_superuser(email="staff@example.com", password=PASSWORD, name="S")


@pytest.fixture
def staff_client(staff):
    client = APIClient()
    client.force_login(staff)
    return client


# --- History recorded by the existing paths ---------------------------------------------


@time_machine.travel(NOW, tick=False)
def test_signup_records_founder_then_trial():
    FounderProgram.objects.filter(pk=1).update(limit=1)

    founder = register("uno@example.com")
    trial = register("dos@example.com")

    assert history_of(founder) == [(None, "productor", "founder")]
    assert history_of(trial) == [(None, "productor", "trial")]
    assert PlanChange.objects.get(user=trial).at == NOW


@time_machine.travel(NOW, tick=False)
def test_expire_trials_records_trial_ended():
    user = User.objects.create_user(
        email="vencida@example.com",
        password=PASSWORD,
        name="Ana",
        plan_id="productor",
        plan_expires_at=NOW - timedelta(minutes=1),
    )

    plans.expire_trials()

    assert history_of(user) == [("productor", "basico", "trial_ended")]


# --- GET /api/auth/suscripcion/ ---------------------------------------------------------


@time_machine.travel(NOW, tick=False)
def test_subscription_of_a_trial_user_with_usage_and_history():
    FounderProgram.objects.filter(pk=1).update(limit=0)
    user = register("ana@example.com")
    make_lote(user)

    response = client_for(user).get(SUBSCRIPTION)

    assert response.status_code == 200
    body = response.json()
    assert body["plan"]["code"] == "productor"
    assert body["plan"]["name"] == "Productor"
    assert body["plan"]["max_lotes"] == 15
    assert body["status"] == "trial"
    assert body["founder_number"] is None
    assert body["trial_ends_at"] == "2026-12-16T09:00:00-03:00"
    assert body["usage"] == {"lotes": 1, "alert_rules": 0}
    assert body["pending_request"] is None
    assert body["history"] == [
        {
            "at": "2026-11-16T09:00:00-03:00",
            "from_plan": None,
            "to_plan": {"code": "productor", "name": "Productor"},
            "reason": "trial",
        }
    ]


def test_subscription_status_founder_and_active(make_user):
    founder = register("uno@example.com")
    active = make_user(email="basico@example.com")

    founder_body = client_for(founder).get(SUBSCRIPTION).json()
    active_body = client_for(active).get(SUBSCRIPTION).json()

    assert (founder_body["status"], founder_body["founder_number"]) == ("founder", 1)
    assert founder_body["trial_ends_at"] is None
    assert (active_body["status"], active_body["plan"]["code"]) == ("active", "basico")
    assert active_body["history"] == []


def test_history_is_newest_first(user):
    with time_machine.travel(NOW, tick=False):
        plans.change_plan(user, "empresa", "staff")
    with time_machine.travel(NOW + timedelta(days=1), tick=False):
        plans.change_plan(user, "productor", "request")

    history = client_for(user).get(SUBSCRIPTION).json()["history"]

    assert [(h["from_plan"], h["to_plan"]["code"], h["reason"]) for h in history] == [
        ({"code": "empresa", "name": "Empresa"}, "productor", "request"),
        ({"code": "basico", "name": "Básico"}, "empresa", "staff"),
    ]


def test_subscription_needs_a_session(api_client):
    assert api_client.get(SUBSCRIPTION).status_code == 403


# --- POST/DELETE /api/auth/suscripcion/pedido/ ------------------------------------------


@time_machine.travel(NOW, tick=False)
def test_asking_for_another_plan_records_a_pending_request(user):
    client = client_for(user)

    response = client.post(REQUEST, {"kind": "change", "plan": "empresa"}, format="json")

    assert response.status_code == 201
    request = PlanRequest.objects.get(user=user)
    assert response.json() == {
        "id": request.pk,
        "kind": "change",
        "plan": "empresa",
        "created_at": "2026-11-16T09:00:00-03:00",
    }
    assert request.status == "pending"
    assert client.get(SUBSCRIPTION).json()["pending_request"] == response.json()


def test_cancel_asks_to_move_to_basico(make_user):
    user = register("uno@example.com")

    response = client_for(user).post(REQUEST, {"kind": "cancel"}, format="json")

    assert response.status_code == 201
    assert (response.json()["kind"], response.json()["plan"]) == ("cancel", "basico")


@pytest.mark.parametrize(
    ("body", "detail"),
    [
        ({"kind": "change", "plan": "basico"}, "Ya estás en el plan Básico."),
        ({"kind": "cancel"}, "Ya estás en el plan Básico."),
        ({"kind": "change", "plan": "oro"}, "Ese plan no existe."),
        ({"kind": "change"}, "Ese plan no existe."),
    ],
)
def test_request_errors(user, body, detail):
    response = client_for(user).post(REQUEST, body, format="json")

    assert response.status_code == 400
    assert response.json() == {"detail": detail}
    assert not PlanRequest.objects.exists()


def test_only_one_pending_request_at_a_time(user):
    client = client_for(user)
    client.post(REQUEST, {"kind": "change", "plan": "empresa"}, format="json")

    response = client.post(REQUEST, {"kind": "change", "plan": "productor"}, format="json")

    assert response.status_code == 400
    assert response.json() == {"detail": "Ya tenés un pedido pendiente."}
    assert PlanRequest.objects.filter(user=user).count() == 1


def test_withdrawing_the_pending_request(user):
    client = client_for(user)
    client.post(REQUEST, {"kind": "change", "plan": "empresa"}, format="json")

    response = client.delete(REQUEST)

    assert response.status_code == 204
    request = PlanRequest.objects.get(user=user)
    assert request.status == "withdrawn" and request.resolved_at is not None
    assert client.get(SUBSCRIPTION).json()["pending_request"] is None
    # A new request is allowed once the old one is withdrawn.
    again = client.post(REQUEST, {"kind": "change", "plan": "productor"}, format="json")
    assert again.status_code == 201


def test_withdrawing_without_a_pending_request_is_404(user):
    response = client_for(user).delete(REQUEST)

    assert response.status_code == 404
    assert response.json() == {"detail": "No tenés un pedido pendiente."}


def test_request_needs_csrf(user):
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(user)

    response = client.post(REQUEST, {"kind": "change", "plan": "empresa"}, format="json")

    assert response.status_code == 403


# --- Admin ------------------------------------------------------------------------------


def pending_request(user, kind="change", plan="empresa"):
    return PlanRequest.objects.create(user=user, kind=kind, plan_id=plan)


@time_machine.travel(NOW, tick=False)
def test_admin_applies_selected_requests(staff, staff_client, django_capture_on_commit_callbacks):
    FounderProgram.objects.filter(pk=1).update(limit=0)
    trial = register("ana@example.com")
    request = pending_request(trial)
    mail.outbox.clear()

    with django_capture_on_commit_callbacks(execute=True):
        response = staff_client.post(
            ADMIN_REQUESTS, {"action": "apply_requests", "_selected_action": [request.pk]}
        )

    assert response.status_code == 302
    trial.refresh_from_db()
    request.refresh_from_db()
    assert (trial.plan_id, trial.plan_expires_at) == ("empresa", None)
    assert (request.status, request.resolved_at, request.resolved_by) == ("applied", NOW, staff)
    change = PlanChange.objects.filter(user=trial).latest("at", "id")
    assert (change.from_plan_id, change.to_plan_id, change.reason) == (
        "productor",
        "empresa",
        "request",
    )
    assert change.by == staff
    assert len(mail.outbox) == 1
    message = mail.outbox[0]
    assert message.to == ["ana@example.com"]
    assert message.subject == "Tu plan ahora es Empresa"
    assert "https://clima.example.com/perfil/suscripcion" in message.body


def test_admin_cancel_request_moves_to_basico(staff_client, django_capture_on_commit_callbacks):
    founder = register("uno@example.com")
    request = pending_request(founder, kind="cancel", plan="basico")

    with django_capture_on_commit_callbacks(execute=True):
        staff_client.post(
            ADMIN_REQUESTS, {"action": "apply_requests", "_selected_action": [request.pk]}
        )

    founder.refresh_from_db()
    assert founder.plan_id == "basico"
    assert history_of(founder)[-1] == ("productor", "basico", "request")


def test_a_lost_email_does_not_undo_the_change(
    user, staff_client, monkeypatch, django_capture_on_commit_callbacks, caplog
):
    request = pending_request(user)

    def smtp_down(*args, **kwargs):
        raise OSError("SMTP down")

    monkeypatch.setattr(plans, "send_mail", smtp_down)
    with django_capture_on_commit_callbacks(execute=True):
        staff_client.post(
            ADMIN_REQUESTS, {"action": "apply_requests", "_selected_action": [request.pk]}
        )

    user.refresh_from_db()
    assert user.plan_id == "empresa"
    assert "Could not send the plan-changed email" in caplog.text


def test_admin_rejects_selected_requests(user, staff, staff_client):
    request = pending_request(user)

    staff_client.post(
        ADMIN_REQUESTS, {"action": "reject_requests", "_selected_action": [request.pk]}
    )

    request.refresh_from_db()
    user.refresh_from_db()
    assert (request.status, request.resolved_by) == ("rejected", staff)
    assert user.plan_id == "basico"
    assert not PlanChange.objects.filter(user=user).exists()
    assert len(mail.outbox) == 0


def test_admin_apply_skips_requests_already_resolved(user, staff_client):
    request = pending_request(user)
    PlanRequest.objects.filter(pk=request.pk).update(status="withdrawn")

    staff_client.post(
        ADMIN_REQUESTS, {"action": "apply_requests", "_selected_action": [request.pk]}
    )

    user.refresh_from_db()
    assert user.plan_id == "basico"
    assert PlanRequest.objects.get(pk=request.pk).status == "withdrawn"


def change_form_data(response):
    """The POST body of an admin change page as rendered: the form plus its inlines."""
    forms = [response.context["adminform"].form]
    for inline in response.context["inline_admin_formsets"]:
        forms += [inline.formset.management_form, *inline.formset.forms]
    data = {}
    for form in forms:
        for field in form:
            if field.field.disabled:
                continue
            value = field.value()
            widget = field.field.widget
            if isinstance(widget, MultiWidget):
                for index, part in enumerate(widget.decompress(value)):
                    data[f"{field.html_name}_{index}"] = "" if part is None else str(part)
            elif isinstance(value, bool):
                if value:
                    data[field.html_name] = "on"
            elif isinstance(value, list):
                data[field.html_name] = value
            else:
                data[field.html_name] = "" if value is None else value
    return data


@time_machine.travel(NOW, tick=False)
def test_a_staff_plan_edit_records_staff_and_ends_the_trial(staff, staff_client):
    FounderProgram.objects.filter(pk=1).update(limit=0)
    trial = register("ana@example.com")
    url = f"/api/admin/accounts/user/{trial.pk}/change/"
    data = change_form_data(staff_client.get(url))
    data["plan"] = "empresa"

    response = staff_client.post(url, data)

    assert response.status_code == 302
    trial.refresh_from_db()
    assert (trial.plan_id, trial.plan_expires_at) == ("empresa", None)
    assert history_of(trial)[-1] == ("productor", "empresa", "staff")
    assert PlanChange.objects.filter(user=trial).latest("at", "id").by == staff


def test_a_staff_edit_without_a_plan_change_records_nothing(user, staff_client):
    url = f"/api/admin/accounts/user/{user.pk}/change/"
    data = change_form_data(staff_client.get(url))
    data["name"] = "Ana María"

    response = staff_client.post(url, data)

    assert response.status_code == 302
    user.refresh_from_db()
    assert user.name == "Ana María"
    assert not PlanChange.objects.filter(user=user).exists()


def test_the_user_page_shows_the_plan_history(staff_client):
    founder = register("uno@example.com")

    response = staff_client.get(f"/api/admin/accounts/user/{founder.pk}/change/")

    assert response.status_code == 200
    assert "Historial de planes" in response.content.decode()


# --- Data migration ---------------------------------------------------------------------


def test_seed_history_of_existing_accounts(make_user):
    migration = importlib.import_module("apps.accounts.migrations.0007_seed_plan_history")
    founder = make_user(email="founder@example.com")
    trial = make_user(email="trial@example.com")
    basico = make_user(email="basico@example.com")
    User.objects.filter(pk=founder.pk).update(plan_id="productor", founder_number=1)
    User.objects.filter(pk=trial.pk).update(plan_id="productor", plan_expires_at=NOW)
    User.objects.filter(pk=founder.pk).update(date_joined=NOW - timedelta(days=9))

    migration.seed(django_apps, None)
    migration.seed(django_apps, None)  # idempotent

    assert history_of(founder) == [(None, "productor", "founder")]
    assert PlanChange.objects.get(user=founder).at == NOW - timedelta(days=9)
    assert history_of(trial) == [(None, "productor", "trial")]
    assert history_of(basico) == []

    plans.change_plan(basico, "empresa", "staff")  # recorded after the migration
    migration.unseed(django_apps, None)

    assert history_of(founder) == history_of(trial) == []
    assert history_of(basico) == [("basico", "empresa", "staff")]
