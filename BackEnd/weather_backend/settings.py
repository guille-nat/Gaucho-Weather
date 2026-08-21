"""
Punto de entrada de configuración.

El entorno se elige con DJANGO_ENV. Por defecto usa 'developer': olvidarse de
declarar la variable en una máquina de desarrollo no debe arrancar con la
configuración de producción a medio completar.

    DJANGO_ENV=production  -> config/production.py
    DJANGO_ENV=developer   -> config/developer.py  (default)
"""

import os

DJANGO_ENV = os.getenv("DJANGO_ENV", "developer").strip().lower()

if DJANGO_ENV == "production":
    from .config.production import *  # noqa: F401,F403
elif DJANGO_ENV in {"testing", "test"}:
    from .config.testing import *  # noqa: F401,F403
elif DJANGO_ENV in {"developer", "development", "dev", "local"}:
    from .config.developer import *  # noqa: F401,F403
else:
    raise RuntimeError(
        f"DJANGO_ENV='{DJANGO_ENV}' no es válido. "
        "Usá 'production', 'developer' o 'testing'."
    )
