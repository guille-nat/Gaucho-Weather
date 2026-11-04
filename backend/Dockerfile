# syntax=docker/dockerfile:1
FROM python:3.13-slim AS base
COPY --from=ghcr.io/astral-sh/uv:0.13.6 /uv /uvx /bin/
# The virtualenv lives outside /app so the dev bind mount does not hide it.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PATH="/opt/venv/bin:$PATH"
RUN useradd --create-home --uid 1000 app
WORKDIR /app

FROM base AS dev
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen
COPY --chown=app . .
USER app
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

FROM base AS prod
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --compile-bytecode
COPY . .
# collectstatic needs no database or real secret; migrate runs at container start.
RUN DJANGO_SETTINGS_MODULE=config.settings.prod DJANGO_SECRET_KEY=build-only \
    python manage.py collectstatic --noinput \
    && chown -R app /app
USER app
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--access-logfile", "-"]
