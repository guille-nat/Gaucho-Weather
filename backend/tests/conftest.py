import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.models import User

PASSWORD = "campo-seguro-2026"


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()  # throttle counters
    yield
    cache.clear()


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
