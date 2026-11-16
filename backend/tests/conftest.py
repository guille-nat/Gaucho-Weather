import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.plans import ensure_default_plans

PASSWORD = "campo-seguro-2026"


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()  # throttle counters
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def _default_plans(request):
    """Put back the plans seeded by migration 0003.

    Transactional tests flush every table, and with --reuse-db the next session would start
    without plans.
    """
    uses_db = request.node.get_closest_marker("django_db") or {"db", "transactional_db"} & set(
        request.fixturenames
    )
    if uses_db:
        request.getfixturevalue("db")
        ensure_default_plans()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def csrf_client():
    """Client that enforces CSRF like a real browser request."""
    return APIClient(enforce_csrf_checks=True)


@pytest.fixture
def make_user(db):
    def _make(email="ana@example.com", name="Ana", password=PASSWORD):
        return User.objects.create_user(email=email, password=password, name=name)

    return _make


@pytest.fixture
def user(make_user):
    return make_user()


@pytest.fixture
def auth_client(user):
    client = APIClient()
    client.force_login(user)
    return client
