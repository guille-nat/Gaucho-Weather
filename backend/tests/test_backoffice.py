"""S4: the backoffice API for super admins (odd/tasks/pagos-backoffice.md)."""

from datetime import UTC, datetime, timedelta

import pytest
import time_machine
from django.core import mail
from rest_framework.test import APIClient

from apps.accounts import plans
from apps.accounts.models import FounderProgram, Plan, PlanChange, PlanRequest, User
from apps.backoffice.models import BackofficeAction
from apps.payments.models import Payment, ProviderSubscription

from .conftest import PASSWORD
from .test_lotes import make_lote

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 11, 16, 12, tzinfo=UTC)
BASE = "/api/backoffice/"
SUMMARY = f"{BASE}resumen/"
ACCOUNTS = f"{BASE}cuentas/"
REQUESTS = f"{BASE}pedidos/"
PRICES = f"{BASE}precios/"
LOG = f"{BASE}registro/"
PAYMENTS = f"{BASE}pagos/"
ADMIN_REQUESTS = "/api/admin/accounts/planrequest/"


def client_for(user):
    client = APIClient()
    client.force_login(user)
    return client


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(email="jefe@example.com", password=PASSWORD, name="Jefe")


@pytest.fixture
def admin_client(admin_user):
    return client_for(admin_user)


def account(email, name="Ana", **fields):
    user = User.objects.create_user(email=email, password=PASSWORD, name=name)
    if fields:
        User.objects.filter(pk=user.pk).update(**fields)
        user.refresh_from_db()
    return user


def pending_request(user, kind="change", plan="empresa"):
    return PlanRequest.objects.create(user=user, kind=kind, plan_id=plan)


# Every endpoint with the method and body that reaches it.
ENDPOINTS = [
    ("get", SUMMARY, None),
    ("get", ACCOUNTS, None),
    ("post", f"{ACCOUNTS}{{user}}/plan/", {"plan": "empresa"}),
    ("get", REQUESTS, None),
    ("post", f"{REQUESTS}{{request}}/aplicar/", {}),
    ("post", f"{REQUESTS}{{request}}/rechazar/", {}),
    ("get", PRICES, None),
    ("put", f"{PRICES}productor/", {"price_ars_month": 1, "price_usd_month": 1}),
    ("get", LOG, None),
    ("get", PAYMENTS, None),
    ("get", f"{PAYMENTS}?tipo=suscripciones", None),
]


class TestAccess:
    @pytest.mark.parametrize(("method", "path", "body"), ENDPOINTS)
    def test_anonymous_is_refused(self, method, path, body):
        target = account("ana@example.com")
        request = pending_request(target)
        url = path.format(user=target.pk, request=request.pk)

        response = getattr(APIClient(), method)(url, body, format="json")

        assert response.status_code == 403
        self.assert_nothing_changed(target, request)

    @pytest.mark.parametrize(("method", "path", "body"), ENDPOINTS)
    def test_a_non_superuser_is_refused(self, method, path, body):
        target = account("ana@example.com")
        request = pending_request(target)
        url = path.format(user=target.pk, request=request.pk)
        staff_only = account("staff@example.com", is_staff=True)

        response = getattr(client_for(staff_only), method)(url, body, format="json")

        assert response.status_code == 403
        assert response.json() == {"detail": "Solo los super admins pueden usar el backoffice."}
        self.assert_nothing_changed(target, request)

    @staticmethod
    def assert_nothing_changed(target, request):
        target.refresh_from_db()
        request.refresh_from_db()
        assert target.plan_id == "basico"
        assert request.status == "pending"
        assert Plan.objects.get(code="productor").price_ars_month is None
        assert not BackofficeAction.objects.exists()


class TestSummary:
    @time_machine.travel(NOW, tick=False)
    def test_counts_accounts_by_membership_and_plan(self, admin_client, admin_user):
        User.objects.filter(pk=admin_user.pk).update(date_joined=NOW - timedelta(days=1))
        FounderProgram.objects.filter(pk=1).update(limit=5, next_number=3)
        account("f1@example.com", plan_id="productor", founder_number=1)
        account("f2@example.com", plan_id="productor", founder_number=2)
        account("t1@example.com", plan_id="productor", plan_expires_at=NOW + timedelta(days=9))
        account("p1@example.com", plan_id="productor")
        account("e1@example.com", plan_id="empresa")
        old = account("b1@example.com", date_joined=NOW - timedelta(days=31))
        pending_request(old)
        withdrawn = pending_request(account("b2@example.com"))
        PlanRequest.objects.filter(pk=withdrawn.pk).update(status="withdrawn")

        response = admin_client.get(SUMMARY)

        assert response.status_code == 200
        # admin_user and b2 are on Básico too; only b1 joined more than 30 days ago.
        assert response.json() == {
            "accounts": {
                "total": 8,
                "founders": 2,
                "trial": 1,
                "active": {"basico": 3, "productor": 1, "empresa": 1},
            },
            "founders_left": 3,
            "pending_requests": 1,
            "new_accounts_last_30_days": 7,
            "payments": {
                "active_subscriptions": 0,
                "monthly_ars": 0,
                "month_payments": 0,
                "month_ars": 0,
            },
        }

    def test_status_counts_match_membership_status(self, admin_client):
        account("f@example.com", founder_number=7, plan_expires_at=NOW)  # founder wins
        account("t@example.com", plan_expires_at=NOW)
        users = User.objects.all()
        expected = {s: 0 for s in ("founder", "trial", "active")}
        for user in users:
            expected[plans.membership_status(user)] += 1

        accounts = admin_client.get(SUMMARY).json()["accounts"]

        assert accounts["founders"] == expected["founder"]
        assert accounts["trial"] == expected["trial"]
        assert sum(accounts["active"].values()) == expected["active"]


class TestAccounts:
    @time_machine.travel(NOW, tick=False)
    def test_lists_paginated_rows(self, admin_client, admin_user):
        User.objects.filter(pk=admin_user.pk).update(date_joined=NOW - timedelta(days=1))
        ana = account("ana@example.com", name="Ana", plan_id="productor", founder_number=4)
        make_lote(ana)
        make_lote(ana)

        response = admin_client.get(ACCOUNTS)

        assert response.status_code == 200
        body = response.json()
        assert (body["count"], body["next"], body["previous"]) == (2, None, None)
        assert body["results"][0] == {
            "id": ana.pk,
            "name": "Ana",
            "email": "ana@example.com",
            "plan": {"code": "productor", "name": "Productor"},
            "status": "founder",
            "founder_number": 4,
            "lotes": 2,
            "date_joined": "2026-11-16T09:00:00-03:00",
            "last_login": None,
            "is_superuser": False,
        }
        assert body["results"][1]["id"] == admin_user.pk
        assert body["results"][1]["is_superuser"] is True

    def test_pages_hold_fifty_rows(self, admin_client):
        User.objects.bulk_create(User(email=f"u{i}@example.com", name=f"U{i}") for i in range(60))

        first = admin_client.get(ACCOUNTS).json()
        second = admin_client.get(ACCOUNTS, {"page": 2}).json()

        assert (first["count"], len(first["results"]), len(second["results"])) == (61, 50, 11)

    def test_searches_name_and_email(self, admin_client):
        account("ana@example.com", name="Ana Pérez")
        account("beto@campo.com", name="Beto")
        account("carla@example.com", name="Carla")

        by_name = admin_client.get(ACCOUNTS, {"q": "pérez"}).json()["results"]
        by_email = admin_client.get(ACCOUNTS, {"q": "CAMPO"}).json()["results"]

        assert [row["email"] for row in by_name] == ["ana@example.com"]
        assert [row["email"] for row in by_email] == ["beto@campo.com"]

    def test_filters_by_plan_and_status(self, admin_client):
        account("f@example.com", plan_id="productor", founder_number=1)
        account("t@example.com", plan_id="productor", plan_expires_at=NOW)
        account("p@example.com", plan_id="productor")
        account("e@example.com", plan_id="empresa")

        def emails(**params):
            return sorted(
                row["email"] for row in admin_client.get(ACCOUNTS, params).json()["results"]
            )

        assert emails(plan="productor") == ["f@example.com", "p@example.com", "t@example.com"]
        assert emails(estado="founder") == ["f@example.com"]
        assert emails(estado="trial") == ["t@example.com"]
        assert emails(plan="productor", estado="active") == ["p@example.com"]

    def test_an_unknown_status_is_a_400(self, admin_client):
        response = admin_client.get(ACCOUNTS, {"estado": "moroso"})

        assert response.status_code == 400
        assert response.json() == {"detail": "Estado inválido: usá founder, trial o active."}


class TestChangePlan:
    def test_goes_through_change_plan_as_staff(self, admin_client, admin_user):
        ana = account("ana@example.com", plan_id="productor", plan_expires_at=NOW)

        response = admin_client.post(
            f"{ACCOUNTS}{ana.pk}/plan/", {"plan": "empresa", "note": "acuerdo"}, format="json"
        )

        assert response.status_code == 200
        assert response.json()["plan"] == {"code": "empresa", "name": "Empresa"}
        assert response.json()["status"] == "active"
        ana.refresh_from_db()
        assert (ana.plan_id, ana.plan_expires_at) == ("empresa", None)
        change = PlanChange.objects.get(user=ana)
        assert (change.from_plan_id, change.to_plan_id, change.reason) == (
            "productor",
            "empresa",
            "staff",
        )
        assert (change.by, change.note) == (admin_user, "acuerdo")
        action = BackofficeAction.objects.get()
        assert (action.actor, action.action, action.target_user) == (
            admin_user,
            "plan_change",
            ana,
        )
        assert action.payload == {"from": "productor", "to": "empresa", "note": "acuerdo"}

    def test_calls_the_shared_change_plan(self, admin_client, admin_user, monkeypatch):
        ana = account("ana@example.com")
        calls = []
        real = plans.change_plan

        def spy(user, plan_code, reason, **kwargs):
            calls.append((user.pk, plan_code, reason, kwargs))
            return real(user, plan_code, reason, **kwargs)

        monkeypatch.setattr(plans, "change_plan", spy)

        admin_client.post(f"{ACCOUNTS}{ana.pk}/plan/", {"plan": "empresa"}, format="json")

        assert calls == [(ana.pk, "empresa", "staff", {"by": admin_user, "note": ""})]

    def test_an_unknown_plan_is_a_400(self, admin_client):
        ana = account("ana@example.com")

        response = admin_client.post(f"{ACCOUNTS}{ana.pk}/plan/", {"plan": "oro"}, format="json")

        assert response.status_code == 400
        assert response.json() == {"detail": "Ese plan no existe."}
        assert not BackofficeAction.objects.exists()

    def test_the_same_plan_is_a_400_and_records_nothing(self, admin_client):
        ana = account("ana@example.com")

        response = admin_client.post(f"{ACCOUNTS}{ana.pk}/plan/", {"plan": "basico"}, format="json")

        assert response.status_code == 400
        assert response.json() == {"detail": "La cuenta ya está en el plan Básico."}
        assert not PlanChange.objects.exists()
        assert not BackofficeAction.objects.exists()

    def test_an_unknown_account_is_a_404(self, admin_client):
        response = admin_client.post(f"{ACCOUNTS}999999/plan/", {"plan": "empresa"}, format="json")

        assert response.status_code == 404


class TestRequests:
    def test_lists_only_pending_requests_oldest_first(self, admin_client):
        ana = account("ana@example.com", name="Ana")
        beto = account("beto@example.com", name="Beto")
        first = pending_request(ana)
        PlanRequest.objects.filter(pk=first.pk).update(created_at=NOW - timedelta(days=1))
        second = pending_request(beto, kind="cancel", plan="basico")
        PlanRequest.objects.create(user=ana, kind="change", plan_id="productor", status="applied")

        response = admin_client.get(REQUESTS)

        assert response.status_code == 200
        body = response.json()
        assert body["count"] == 2
        assert [row["id"] for row in body["results"]] == [first.pk, second.pk]
        assert body["results"][0] == {
            "id": first.pk,
            "kind": "change",
            "plan": {"code": "empresa", "name": "Empresa"},
            "status": "pending",
            "created_at": "2026-11-15T09:00:00-03:00",
            "user": {
                "id": ana.pk,
                "name": "Ana",
                "email": "ana@example.com",
                "plan": {"code": "basico", "name": "Básico"},
                "status": "active",
            },
        }

    @time_machine.travel(NOW, tick=False)
    def test_apply_behaves_like_the_admin_action(
        self, admin_client, admin_user, django_capture_on_commit_callbacks
    ):
        FounderProgram.objects.filter(pk=1).update(limit=0)
        trial = account("ana@example.com", plan_id="productor", plan_expires_at=NOW)
        request = pending_request(trial)

        with django_capture_on_commit_callbacks(execute=True):
            response = admin_client.post(f"{REQUESTS}{request.pk}/aplicar/", format="json")

        assert response.status_code == 200
        assert response.json()["status"] == "applied"
        trial.refresh_from_db()
        request.refresh_from_db()
        assert (trial.plan_id, trial.plan_expires_at) == ("empresa", None)
        assert (request.status, request.resolved_at, request.resolved_by) == (
            "applied",
            NOW,
            admin_user,
        )
        change = PlanChange.objects.get(user=trial)
        assert (change.to_plan_id, change.reason, change.by) == ("empresa", "request", admin_user)
        assert [m.subject for m in mail.outbox] == ["Tu plan ahora es Empresa"]
        action = BackofficeAction.objects.get()
        assert (action.actor, action.action, action.target_user) == (
            admin_user,
            "request_apply",
            trial,
        )
        assert action.payload == {"request": request.pk, "kind": "change", "plan": "empresa"}

    def test_reject_behaves_like_the_admin_action(self, admin_client, admin_user):
        ana = account("ana@example.com")
        request = pending_request(ana)

        response = admin_client.post(
            f"{REQUESTS}{request.pk}/rechazar/", {"note": "sin pago"}, format="json"
        )

        assert response.status_code == 200
        assert response.json()["status"] == "rejected"
        request.refresh_from_db()
        ana.refresh_from_db()
        assert (request.status, request.resolved_by) == ("rejected", admin_user)
        assert ana.plan_id == "basico"
        assert not PlanChange.objects.exists()
        assert len(mail.outbox) == 0
        action = BackofficeAction.objects.get()
        assert (action.action, action.target_user) == ("request_reject", ana)
        assert action.payload == {
            "request": request.pk,
            "kind": "change",
            "plan": "empresa",
            "note": "sin pago",
        }

    @pytest.mark.parametrize("verb", ["aplicar", "rechazar"])
    def test_a_resolved_request_is_a_409(self, admin_client, verb):
        ana = account("ana@example.com")
        request = pending_request(ana)
        PlanRequest.objects.filter(pk=request.pk).update(status="withdrawn")

        response = admin_client.post(f"{REQUESTS}{request.pk}/{verb}/", format="json")

        assert response.status_code == 409
        assert response.json() == {"detail": "El pedido ya no está pendiente."}
        assert PlanRequest.objects.get(pk=request.pk).status == "withdrawn"
        assert not BackofficeAction.objects.exists()

    def test_an_unknown_request_is_a_404(self, admin_client):
        assert admin_client.post(f"{REQUESTS}999999/aplicar/", format="json").status_code == 404

    def test_the_admin_action_still_applies_requests(
        self, admin_client, admin_user, django_capture_on_commit_callbacks
    ):
        ana = account("ana@example.com")
        request = pending_request(ana)

        with django_capture_on_commit_callbacks(execute=True):
            response = admin_client.post(
                ADMIN_REQUESTS, {"action": "apply_requests", "_selected_action": [request.pk]}
            )

        assert response.status_code == 302
        ana.refresh_from_db()
        request.refresh_from_db()
        assert (ana.plan_id, request.status, request.resolved_by) == (
            "empresa",
            "applied",
            admin_user,
        )
        assert PlanChange.objects.get(user=ana).reason == "request"
        assert len(mail.outbox) == 1
        assert not BackofficeAction.objects.exists()  # the admin keeps its own history


class TestPrices:
    def test_lists_every_plan_with_both_prices(self, admin_client):
        Plan.objects.filter(code="productor").update(price_ars_month=14900, price_usd_month=15)

        response = admin_client.get(PRICES)

        assert response.status_code == 200
        assert response.json() == [
            {
                "code": "basico",
                "name": "Básico",
                "price_ars_month": None,
                "price_usd_month": None,
                "pending_change": None,
            },
            {
                "code": "productor",
                "name": "Productor",
                "price_ars_month": 14900,
                "price_usd_month": 15,
                "pending_change": None,
            },
            {
                "code": "empresa",
                "name": "Empresa",
                "price_ars_month": None,
                "price_usd_month": None,
                "pending_change": None,
            },
        ]

    def test_updates_both_prices_and_records_it(self, admin_client, admin_user):
        Plan.objects.filter(code="productor").update(price_ars_month=14900, price_usd_month=15)

        response = admin_client.put(
            f"{PRICES}productor/",
            {"price_ars_month": 16500, "price_usd_month": None},
            format="json",
        )

        assert response.status_code == 200
        assert response.json() == {
            "code": "productor",
            "name": "Productor",
            "price_ars_month": 16500,
            "price_usd_month": None,
            "pending_change": None,
        }
        plan = Plan.objects.get(code="productor")
        assert (plan.price_ars_month, plan.price_usd_month) == (16500, None)
        action = BackofficeAction.objects.get()
        assert (action.actor, action.action, action.target_user) == (
            admin_user,
            "price_update",
            None,
        )
        assert action.payload == {
            "plan": "productor",
            "before": {"price_ars_month": 14900, "price_usd_month": 15},
            "after": {"price_ars_month": 16500, "price_usd_month": None},
        }

    def test_zero_means_free(self, admin_client):
        response = admin_client.put(
            f"{PRICES}basico/", {"price_ars_month": 0, "price_usd_month": 0}, format="json"
        )

        assert response.status_code == 200
        plan = Plan.objects.get(code="basico")
        assert (plan.price_ars_month, plan.price_usd_month) == (0, 0)

    @pytest.mark.parametrize("bad", [-1, 1.5, "mucho", True])
    def test_a_price_must_be_a_non_negative_integer_or_null(self, admin_client, bad):
        response = admin_client.put(
            f"{PRICES}productor/", {"price_ars_month": bad, "price_usd_month": 10}, format="json"
        )

        assert response.status_code == 400
        assert set(response.json()) == {"price_ars_month"}
        plan = Plan.objects.get(code="productor")
        assert (plan.price_ars_month, plan.price_usd_month) == (None, None)
        assert not BackofficeAction.objects.exists()

    def test_both_prices_are_required(self, admin_client):
        response = admin_client.put(f"{PRICES}productor/", {"price_ars_month": 1}, format="json")

        assert response.status_code == 400
        assert set(response.json()) == {"price_usd_month"}
        assert not BackofficeAction.objects.exists()

    def test_an_unknown_plan_is_a_404(self, admin_client):
        response = admin_client.put(
            f"{PRICES}oro/", {"price_ars_month": 1, "price_usd_month": 1}, format="json"
        )

        assert response.status_code == 404


class TestLog:
    def test_lists_recent_actions_newest_first(self, admin_client, admin_user):
        ana = account("ana@example.com", name="Ana")
        admin_client.post(f"{ACCOUNTS}{ana.pk}/plan/", {"plan": "empresa"}, format="json")
        admin_client.put(
            f"{PRICES}empresa/", {"price_ars_month": 1, "price_usd_month": 2}, format="json"
        )

        response = admin_client.get(LOG)

        assert response.status_code == 200
        body = response.json()
        assert body["count"] == 2
        price, plan = body["results"]
        assert price["action"] == "price_update"
        assert price["target_user"] is None
        assert plan["action"] == "plan_change"
        assert plan["actor"] == {"id": admin_user.pk, "name": "Jefe", "email": "jefe@example.com"}
        assert plan["target_user"] == {"id": ana.pk, "name": "Ana", "email": "ana@example.com"}
        assert plan["payload"] == {"from": "basico", "to": "empresa", "note": ""}
        assert set(plan) == {"id", "action", "actor", "target_user", "payload", "at"}


# --- S7: payments in the backoffice ---------------------------------------------------------


def provider_subscription(user, external_id, status="authorized", plan="productor", **fields):
    return ProviderSubscription.objects.create(
        user=user,
        plan_id=plan,
        provider="mercadopago",
        currency="ARS",
        amount={"productor": 14900, "empresa": 49900}[plan],
        external_id=external_id,
        status=status,
        **fields,
    )


def payment(user, external_id, amount="14900.00", status="approved", paid_at=NOW, sub=None):
    return Payment.objects.create(
        user=user,
        subscription=sub,
        provider="mercadopago",
        external_id=external_id,
        amount=amount,
        currency="ARS",
        status=status,
        paid_at=paid_at,
        payload={"payer": {"email": "secreto@example.com"}},
    )


class TestPaymentsSummary:
    @time_machine.travel(NOW, tick=False)
    def test_adds_monthly_ars_revenue_and_this_months_payments(self, admin_client):
        ana = account("ana@example.com")
        beto = account("beto@example.com")
        provider_subscription(ana, "sub-a")
        provider_subscription(beto, "sub-b", plan="empresa")
        provider_subscription(beto, "sub-c", status="pending")
        provider_subscription(beto, "sub-d", status="cancelled", ended_at=NOW)
        payment(ana, "p1")
        payment(beto, "p2", amount="49900.00")
        payment(beto, "p3", status="rejected")
        # 2026-11-01 02:00 UTC is still October 31 in Buenos Aires.
        payment(ana, "p4", paid_at=datetime(2026, 11, 1, 2, tzinfo=UTC))

        response = admin_client.get(SUMMARY)

        assert response.status_code == 200
        assert response.json()["payments"] == {
            "active_subscriptions": 2,
            "monthly_ars": 14900 + 49900,
            "month_payments": 2,
            "month_ars": 64800,
        }


class TestPaymentList:
    def test_lists_payments_newest_first_without_the_provider_payload(self, admin_client):
        ana = account("ana@example.com", name="Ana")
        sub = provider_subscription(ana, "sub-a")
        older = payment(ana, "p1", sub=sub)
        Payment.objects.filter(pk=older.pk).update(created_at=NOW - timedelta(days=30))
        newer = payment(ana, "p2", status="rejected", paid_at=None, sub=sub)

        response = admin_client.get(PAYMENTS)

        assert response.status_code == 200
        body = response.json()
        assert body["count"] == 2
        assert [row["id"] for row in body["results"]] == [newer.pk, older.pk]
        assert body["results"][0] == {
            "id": newer.pk,
            "user": {"id": ana.pk, "name": "Ana", "email": "ana@example.com"},
            "provider": "mercadopago",
            "external_id": "p2",
            "subscription": sub.pk,
            "amount": 14900,
            "currency": "ARS",
            "status": "rejected",
            "paid_at": None,
            "created_at": body["results"][0]["created_at"],
        }
        assert "payload" not in body["results"][0]

    def test_lists_subscriptions(self, admin_client):
        ana = account("ana@example.com", name="Ana")
        sub = provider_subscription(
            ana, "sub-a", status="cancelled", next_payment_at=NOW + timedelta(days=9)
        )

        response = admin_client.get(PAYMENTS, {"tipo": "suscripciones"})

        assert response.status_code == 200
        row = response.json()["results"][0]
        assert row == {
            "id": sub.pk,
            "user": {"id": ana.pk, "name": "Ana", "email": "ana@example.com"},
            "plan": {"code": "productor", "name": "Productor"},
            "provider": "mercadopago",
            "external_id": "sub-a",
            "currency": "ARS",
            "amount": 14900,
            "status": "cancelled",
            "next_payment_at": row["next_payment_at"],
            "ends_at": row["next_payment_at"],
            "ended_at": None,
            "created_at": row["created_at"],
        }
        assert row["next_payment_at"] is not None
        assert "checkout_url" not in row

    def test_an_unknown_tipo_is_400(self, admin_client):
        response = admin_client.get(PAYMENTS, {"tipo": "otra"})

        assert response.status_code == 400
        assert response.json() == {"detail": "Tipo inválido: usá pagos o suscripciones."}
