"""
Configuración para correr los tests.

Sin dependencias externas: base en memoria y caché local. Así la suite corre
igual en tu máquina y en CI, sin levantar Postgres ni Redis.
"""

from .base import *  # noqa: F401,F403

DEBUG = False
ALLOWED_HOSTS = ["*", "testserver"]
CORS_ALLOW_ALL_ORIGINS = True

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

# Caché local por proceso: los tests de caché verifican comportamiento, no
# necesitan un Redis real.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "gaucho-tests",
    }
}

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
FRONTEND_URL = "https://gauchoweather.test"

# Hashear con PBKDF2 completo hace lenta la suite; para los tests alcanza MD5.
# Los tests de contraseña verifican que se hashee, no con qué algoritmo.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# El throttling ensucia los tests con 429 inesperados. Los scopes tienen que
# seguir declarados: DRF falla si una vista pide un scope que no existe. Con
# rate None el límite queda desactivado.
REST_FRAMEWORK = {  # noqa: F405
    **REST_FRAMEWORK,  # noqa: F405
    "DEFAULT_THROTTLE_CLASSES": (),
    "DEFAULT_THROTTLE_RATES": {
        "anon": None,
        "user": None,
        "password_reset": None,
    },
}

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
