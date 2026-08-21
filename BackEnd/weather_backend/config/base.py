"""
Configuración compartida por todos los entornos.

Este módulo NO define DEBUG, ALLOWED_HOSTS ni DATABASES: cada entorno
(developer.py / production.py) los declara según corresponda. Todo valor
sensible se lee del entorno, nunca se escribe literal acá.
"""

import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv()


def env_bool(name, default=False):
    """Lee un booleano del entorno aceptando 1/true/yes/on."""
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name, default=None):
    """Lee una lista separada por comas, descartando espacios y vacíos."""
    raw = os.getenv(name)
    if not raw:
        return list(default or [])
    return [item.strip() for item in raw.split(",") if item.strip()]


def env_required(name):
    """
    Obliga a que la variable exista. Preferimos fallar al arrancar antes que
    levantar el servicio con un secreto vacío.
    """
    value = os.getenv(name)
    if not value:
        raise RuntimeError(
            f"Falta la variable de entorno obligatoria '{name}'. "
            "Revisá tu archivo .env (ver .env.example)."
        )
    return value


SECRET_KEY = env_required("SECRET_KEY")
TOMORROW_API_KEY = env_required("TOMORROW_API_KEY")

# Application definition

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "drf_yasg",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "weather",
    "users",
]

# NOTA IMPORTANTE SOBRE CACHÉ
# ---------------------------
# Acá NO va UpdateCacheMiddleware / FetchFromCacheMiddleware.
# Ese par cachea toda respuesta GET usando la URL como clave. Como la API se
# autentica con JWT en el header Authorization (no con cookie de sesión),
# Django no agrega 'Vary: Cookie' y la respuesta de un usuario autenticado
# quedaría servida a cualquier otro que pida la misma URL.
# El cacheo se hace de forma explícita dentro de cada vista (weather/views.py),
# que es donde sabemos qué datos son públicos y cuáles no.
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.gzip.GZipMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "weather_backend.urls"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),
    # La API pega contra Tomorrow.io, que se paga por request. El throttle
    # protege tanto el servicio como la factura.
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.getenv("THROTTLE_ANON", "60/hour"),
        "user": os.getenv("THROTTLE_USER", "600/hour"),
        "password_reset": os.getenv("THROTTLE_PASSWORD_RESET", "5/hour"),
    },
}


TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# Apunta a la app 'users' y al modelo 'CustomUser'
AUTH_USER_MODEL = "users.CustomUser"

WSGI_APPLICATION = "weather_backend.wsgi.application"
ASGI_APPLICATION = "weather_backend.asgi.application"

MIGRATION_MODULES = {"weather": "migrations.weather", "users": "migrations.users"}

# CORS: los orígenes permitidos se declaran por entorno. Nunca
# CORS_ALLOW_ALL_ORIGINS junto con CORS_ALLOW_CREDENTIALS.
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_METHODS = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
]
CORS_ALLOW_HEADERS = [
    "content-type",
    "authorization",
    "x-csrftoken",
    "accept",
    "accept-language",
    "x-requested-with",
]


AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 8},
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=int(os.getenv("JWT_ACCESS_MINUTES", "15"))
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.getenv("JWT_REFRESH_DAYS", "7"))),
    "ROTATE_REFRESH_TOKENS": True,
    # Si rotamos el refresh token, el anterior tiene que dejar de servir.
    # Con False, un token robado seguía siendo válido hasta su vencimiento.
    "BLACKLIST_AFTER_ROTATION": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": env_required("SECRET_KEY_JWT"),
}

# Caché con Redis
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = os.getenv("REDIS_PORT", "6379")
REDIS_DB = os.getenv("REDIS_DB", "1")

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}",
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
            "SOCKET_CONNECT_TIMEOUT": 5,
            "SOCKET_TIMEOUT": 5,
            # Si Redis se cae, la app sigue respondiendo (más lenta) en lugar
            # de devolver 500 en cada request.
            "IGNORE_EXCEPTIONS": True,
        },
    }
}
DJANGO_REDIS_IGNORE_EXCEPTIONS = True

# Tiempo de vida por defecto para caché (en segundos)
CACHE_TTL = 60 * 60  # 1 hora

# Las sesiones viven en la base, no en caché: un flush de Redis no debe
# desloguear a nadie ni perder la sesión del admin.
SESSION_ENGINE = "django.contrib.sessions.backends.db"

# Internationalization
# https://docs.djangoproject.com/en/5.1/topics/i18n/

LANGUAGE_CODE = "es-ar"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.1/howto/static-files/

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR.parent / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR.parent / "media"

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"
    },
}

# Default primary key field type
# https://docs.djangoproject.com/en/5.1/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Logging: todo a stdout. En un contenedor los archivos de log se pierden al
# recrearlo y crecen sin control; el runtime se encarga de recolectarlos.
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": LOG_LEVEL,
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": LOG_LEVEL,
            "propagate": False,
        },
        "django.db.backends": {
            "handlers": ["console"],
            # Las queries en DEBUG son ruido salvo que las estés buscando.
            "level": os.getenv("LOG_LEVEL_SQL", "WARNING").upper(),
            "propagate": False,
        },
    },
}

# Email: por defecto a consola para que ningún entorno mande correo sin
# configurarlo explícitamente.
EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend"
)
EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "no-reply@gauchoweather.com")

# URL pública del frontend, usada para armar los links de los mails.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5174")
