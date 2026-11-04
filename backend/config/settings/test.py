from .base import *  # noqa: F403
from .base import DATABASES, env

SECRET_KEY = "test-secret-key"
ALLOWED_HOSTS = ["testserver", "localhost"]

# Tests run on the host or in CI against a plain Postgres, not inside Compose.
DATABASES["default"].update(
    {
        "NAME": env("DB_NAME", "gaucho"),
        "USER": env("DB_USER", "postgres"),
        "PASSWORD": env("DB_PASSWORD", "postgres"),
        "HOST": env("DB_HOST", "localhost"),
        "PORT": env("DB_PORT", "5432"),
        "CONN_MAX_AGE": 0,
    }
)

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
CELERY_TASK_ALWAYS_EAGER = True
OPEN_METEO_API_KEY = ""
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
