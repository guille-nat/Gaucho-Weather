"""
Configuración de desarrollo local.

Es permisiva a propósito. Nada de lo que hay acá debe migrar a production.py.
"""

from .base import *  # noqa: F401,F403
from .base import env_list

DEBUG = True

ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", ["localhost", "127.0.0.1", "0.0.0.0"])

# En local aceptamos cualquier origen para no pelear con los puertos de Vite.
CORS_ALLOW_ALL_ORIGINS = True

# Por defecto Postgres, igual que producción, así los problemas aparecen acá y
# no en el deploy. Poné USE_SQLITE=1 para levantar sin base externa.
if os.getenv("USE_SQLITE", "").strip().lower() in {"1", "true", "yes"}:  # noqa: F405
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",  # noqa: F405
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("POSTGRES_DB", "gaucho_weather"),  # noqa: F405
            "USER": os.getenv("POSTGRES_USER", "postgres"),  # noqa: F405
            "PASSWORD": os.getenv("POSTGRES_PASSWORD", "postgres"),  # noqa: F405
            "HOST": os.getenv("POSTGRES_HOST", "localhost"),  # noqa: F405
            "PORT": os.getenv("POSTGRES_PORT", "5433"),  # noqa: F405
        }
    }

# En desarrollo los estáticos los sirve Django. El manifest de WhiteNoise exige
# haber corrido collectstatic y molesta más de lo que ayuda.
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
