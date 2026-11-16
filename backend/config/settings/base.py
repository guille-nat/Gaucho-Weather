"""Settings shared by every environment. Secrets and hosts come from env vars."""

import os
from pathlib import Path

from celery.schedules import crontab

BASE_DIR = Path(__file__).resolve().parent.parent.parent


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in env(name, default).split(",") if item.strip()]


def env_int(name: str, default: int) -> int:
    value = env(name)
    return int(value) if value else default


SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = False
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "apps.accounts",
    "apps.lotes",
    "apps.archiver",
    "apps.weather",
    "apps.alerts",
    "apps.places",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("DB_NAME", "gaucho"),
        "USER": env("DB_USER", "gaucho"),
        "PASSWORD": env("DB_PASSWORD"),
        "HOST": env("DB_HOST", "db"),
        "PORT": env("DB_PORT", "5432"),
        "CONN_MAX_AGE": 60,
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Spanish so DRF and Django validation messages reach the UI already translated.
LANGUAGE_CODE = "es"
TIME_ZONE = "America/Argentina/Buenos_Aires"
USE_I18N = True
USE_TZ = True

# Under /api/ so the same proxy rule that serves the API serves the admin assets.
STATIC_URL = "/api/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# --- Sessions and CSRF (S6/S8) ---
SESSION_COOKIE_AGE = 60 * 60 * 24 * 60  # 60 days
SESSION_SAVE_EVERY_REQUEST = True  # renews the 60 days on every request
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_HTTPONLY = False  # the SPA reads it and sends it back as X-CSRFToken
CSRF_COOKIE_SAMESITE = "Lax"

# --- Cache (DRF throttling counters, place lookups, on-demand fetch locks) ---
REDIS_URL = env("REDIS_URL", "redis://redis:6379")
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": f"{REDIS_URL}/1",
    }
}

# --- DRF ---
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.accounts.authentication.CsrfSessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_THROTTLE_RATES": {
        "login": env("THROTTLE_LOGIN_RATE", "10/min"),
        "register": env("THROTTLE_REGISTER_RATE", "10/hour"),
        # Public endpoints (S10). A forecast miss costs ~7 Open-Meteo calls.
        "public_forecast": env("THROTTLE_PUBLIC_FORECAST_RATE", "60/hour"),
        "places": env("THROTTLE_PLACES_RATE", "300/hour"),
        "plans": env("THROTTLE_PLANS_RATE", "300/hour"),
        "password_reset": env("THROTTLE_PASSWORD_RESET_RATE", "5/hour"),
    },
    # Number of reverse proxies in front of Django; DRF reads the client IP for
    # throttling from X-Forwarded-For using this count. 0 = use REMOTE_ADDR.
    # Never None: DRF would then trust the whole (spoofable) X-Forwarded-For header.
    "NUM_PROXIES": env_int("TRUSTED_PROXY_COUNT", 0),
    "COERCE_DECIMAL_TO_STRING": False,
}

# --- Celery ---
CELERY_BROKER_URL = f"{REDIS_URL}/0"
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_IGNORE_RESULT = True
CELERY_BEAT_SCHEDULE = {
    "archive-forecasts": {
        "task": "archiver.fetch_forecasts",
        "schedule": crontab(minute=0, hour="*/6"),
    },
    "archive-smn-observations": {
        "task": "archiver.fetch_smn_observations",
        "schedule": crontab(minute=0, hour=3),
    },
    "archive-history": {
        "task": "archiver.fetch_history",
        "schedule": crontab(minute=30, hour=4),
    },
    "expire-trials": {
        "task": "accounts.expire_trials",
        "schedule": crontab(minute=0, hour=9),
    },
}

# --- Email (trial notices, password reset, alerts) ---
# Console in dev: messages are printed in the backend/worker logs. Prod: smtp backend + EMAIL_*.
# An empty value in .env means "use the default", like an unset one.
EMAIL_BACKEND = env("EMAIL_BACKEND") or "django.core.mail.backends.console.EmailBackend"
EMAIL_HOST = env("EMAIL_HOST") or "localhost"
EMAIL_PORT = env_int("EMAIL_PORT", 587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD")
EMAIL_USE_TLS = (env("EMAIL_USE_TLS") or "true").lower() == "true"
EMAIL_TIMEOUT = 15
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL") or "Gaucho Weather <no-reply@localhost>"

PASSWORD_RESET_TIMEOUT = 60 * 60  # reset links last 1 hour

# Public origin of the SPA, for links inside emails (no trailing slash).
PUBLIC_APP_URL = (env("PUBLIC_APP_URL") or "http://localhost:5173").rstrip("/")

# --- Archiver data sources (S9) ---
OPEN_METEO_FORECAST_URL = env("OPEN_METEO_FORECAST_URL", "https://api.open-meteo.com/v1/forecast")
OPEN_METEO_ENSEMBLE_URL = env(
    "OPEN_METEO_ENSEMBLE_URL", "https://ensemble-api.open-meteo.com/v1/ensemble"
)
OPEN_METEO_API_KEY = env("OPEN_METEO_API_KEY")
# Past weather per lote (S9–S11): the Historical Forecast API fills our own WeatherHour table.
OPEN_METEO_HISTORICAL_URL = env("OPEN_METEO_HISTORICAL_URL") or (
    "https://historical-forecast-api.open-meteo.com/v1/forecast"
)
# A new or moved lote loads the last 90 days of its cell in the background.
HISTORY_BACKFILL_ON_CREATE = (env("HISTORY_BACKFILL_ON_CREATE") or "true").lower() == "true"
SMN_DATOHORARIO_URL = env(
    "SMN_DATOHORARIO_URL",
    "https://ssl.smn.gob.ar/dpd/descarga_opendata.php?file=observaciones/datohorario{date}.txt",
)
SMN_LOOKBACK_DAYS = env_int("SMN_LOOKBACK_DAYS", 3)

# --- Custom alerts (S6) ---
# A cell whose latest forecast is older than this is not evaluated (stale data, no alerts).
ALERTS_MAX_FORECAST_AGE_HOURS = env_int("ALERTS_MAX_FORECAST_AGE_HOURS", 12)

# --- Places (S10): Georef AR, CC BY 4.0, commercial use allowed ---
GEOREF_API_URL = env("GEOREF_API_URL", "https://apis.datos.gob.ar/georef/api")
PLACES_CACHE_SECONDS = env_int("PLACES_CACHE_SECONDS", 60 * 60 * 24)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
