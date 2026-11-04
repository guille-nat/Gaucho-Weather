from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import ALLOWED_HOSTS, SECRET_KEY, env_int

if not SECRET_KEY:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY is required in production.")
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS is required in production.")

DEBUG = False

# TLS ends at the reverse proxy; trust its X-Forwarded-Proto header.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_CONTENT_TYPE_NOSNIFF = True

REST_FRAMEWORK["NUM_PROXIES"] = env_int("TRUSTED_PROXY_COUNT", 2)  # noqa: F405

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# HTTPS redirect and HSTS are set by the TLS-terminating reverse proxy (VPS global nginx).
SILENCED_SYSTEM_CHECKS = ["security.W004", "security.W008"]
