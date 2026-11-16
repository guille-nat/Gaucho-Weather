"""Which push endpoints the worker may POST to: the browsers' push services, nothing else.

Checked when a subscription is saved and again before every send, so a row stored before the
allowlist existed (or edited by hand) can never make the worker call an internal host (SSRF).
"""

from urllib.parse import urlsplit

from django.conf import settings


def is_allowed_push_endpoint(url: str) -> bool:
    parts = urlsplit(url)
    if parts.scheme != "https":
        return False
    host = (parts.hostname or "").lower()
    return any(
        host == allowed or host.endswith(f".{allowed}") for allowed in settings.PUSH_ALLOWED_HOSTS
    )
