# syntax=docker/dockerfile:1
# ============================================================================
# Imagen del backend, con dos destinos:
#   --target development  -> runserver con recarga automática
#   --target production    -> gunicorn, usuario sin privilegios, estáticos listos
# ============================================================================

# --- Base común -------------------------------------------------------------
FROM python:3.10-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# libpq5 es la biblioteca en tiempo de ejecución de Postgres; la necesita
# psycopg2 incluso usando la rueda precompilada.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/*


# --- Dependencias -----------------------------------------------------------
# Etapa aparte: mientras requirements.txt no cambie, Docker reutiliza la caché
# aunque cambie el código.
FROM base AS deps

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --prefix=/install -r requirements.txt


# --- Desarrollo -------------------------------------------------------------
FROM base AS development

COPY --from=deps /install /usr/local
COPY . .

ENV DJANGO_ENV=developer
EXPOSE 8001
CMD ["python", "manage.py", "runserver", "0.0.0.0:8001"]


# --- Producción -------------------------------------------------------------
FROM base AS production

COPY --from=deps /install /usr/local

# Usuario sin privilegios: si alguien logra ejecutar código, no lo hace como root.
RUN groupadd --system --gid 1001 django \
    && useradd --system --uid 1001 --gid django --create-home django

COPY --chown=django:django . .

# Directorios de escritura. Van con dueño explícito porque el proceso ya no
# corre como root y no podría crearlos después.
RUN mkdir -p /app/../staticfiles /app/../media \
    && chown -R django:django /app

USER django

ENV DJANGO_ENV=production

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8001/healthz || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["gunicorn", "weather_backend.wsgi:application", \
     "--bind", "0.0.0.0:8001", \
     "--workers", "3", \
     "--timeout", "60", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
