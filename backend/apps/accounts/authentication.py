from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import PermissionDenied

CSRF_FAILED_MESSAGE = "Token CSRF ausente o inválido. Recargue la página e intente de nuevo."


class CsrfSessionAuthentication(SessionAuthentication):
    """Session auth whose CSRF failure message is in Spanish."""

    def enforce_csrf(self, request):
        try:
            super().enforce_csrf(request)
        except PermissionDenied as exc:
            raise PermissionDenied(CSRF_FAILED_MESSAGE) from exc


def enforce_csrf(request) -> None:
    """Check CSRF even for anonymous requests (DRF only checks logged-in ones)."""
    CsrfSessionAuthentication().enforce_csrf(request)
