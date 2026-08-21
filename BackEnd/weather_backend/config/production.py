"""
Configuración de producción.

Todo lo que puede exponer datos o dejar la app abierta se declara acá de forma
explícita y se lee del entorno. Si falta una variable, el proceso no arranca:
es preferible un deploy fallido a un servicio inseguro corriendo.
"""

from .base import *  # noqa: F401,F403
from .base import env_bool, env_list, env_required

DEBUG = False

# Sin comodines. Cada host que sirve la app tiene que estar declarado.
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS")
if not ALLOWED_HOSTS:
    raise RuntimeError(
        "ALLOWED_HOSTS está vacío. Declaralo en .env, "
        "por ejemplo: ALLOWED_HOSTS=api.gauchoweather.com,gauchoweather.com"
    )

# CORS restringido a los orígenes del frontend. Nunca CORS_ALLOW_ALL_ORIGINS
# en producción: junto con CORS_ALLOW_CREDENTIALS permitiría que cualquier
# sitio hiciera pedidos autenticados en nombre del usuario.
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")
if not CORS_ALLOWED_ORIGINS:
    raise RuntimeError(
        "CORS_ALLOWED_ORIGINS está vacío. Declaralo en .env, "
        "por ejemplo: CORS_ALLOWED_ORIGINS=https://gauchoweather.com"
    )

CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", CORS_ALLOWED_ORIGINS)

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env_required("POSTGRES_DB"),
        "USER": env_required("POSTGRES_USER"),
        "PASSWORD": env_required("POSTGRES_PASSWORD"),
        "HOST": os.getenv("POSTGRES_HOST", "db"),  # noqa: F405
        "PORT": os.getenv("POSTGRES_PORT", "5432"),  # noqa: F405
        # Reusar conexiones evita el handshake en cada request.
        "CONN_MAX_AGE": int(os.getenv("DB_CONN_MAX_AGE", "60")),  # noqa: F405
    }
}

# --- Seguridad de transporte -------------------------------------------------
# Nginx termina TLS y reenvía por HTTP, así que Django necesita este header
# para saber que la conexión original era segura.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", True)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

# HSTS: arrancá con un valor bajo (por ejemplo 3600) y subilo a un año recién
# cuando confirmes que el certificado renueva bien. Es difícil de revertir:
# el navegador recuerda la política.
SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "3600"))  # noqa: F405
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", False)
SECURE_HSTS_PRELOAD = env_bool("SECURE_HSTS_PRELOAD", False)

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
