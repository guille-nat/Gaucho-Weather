# Entorno
> Última actualización: 2026-11-16

## Qué hace
Todo corre en contenedores con Docker Compose: `docker-compose.yml` para
desarrollo y `docker-compose.prod.yml` para producción.

## Cómo funciona
| Servicio | Dev | Puerto del host |
|---|---|---|
| `db` | Postgres 17 | no se publica |
| `redis` | broker de Celery y caché de los límites de pedidos | no se publica |
| `backend` | Django `runserver`, aplica migraciones al arrancar | `BACKEND_PORT` (8001) |
| `worker` | `celery worker` | — |
| `beat` | `celery beat` (agenda del archivador, de las alertas y de las pruebas de plan) | — |
| `frontend` | Vite (`frontend/Dockerfile`, target `dev`), con proxy de `/api` a `http://backend:8000` | `FRONTEND_PORT` (5173) |

- Levantar: `cp .env.example .env` y después `docker compose up -d --build`.
- Backend: `backend/Dockerfile`, multi-stage (`dev` y `prod`), usuario no root
  `app`. Las dependencias se manejan con `uv` (`pyproject.toml` y `uv.lock`), y el
  virtualenv está en `/opt/venv` para que el bind mount no lo tape.
- Settings por entorno en `backend/config/settings/`: `dev`, `prod` y `test`.
  `DJANGO_SETTINGS_MODULE` lo define Compose.
- Variables: todas están en `.env.example`, que es el contrato. En prod son
  obligatorias `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `DB_NAME`, `DB_USER`
  y `DB_PASSWORD`.
- Producción: `gunicorn`, sin bind mounts y con `restart: unless-stopped`. Solo
  se publica el nginx del frontend, que hace de proxy de `/api` al backend.
  `migrate` corre al arrancar el backend y `collectstatic` en el build.
- Tests del backend:
  - Dentro de Compose: `docker compose exec backend pytest -q`.
  - En el host, con un Postgres propio: `cd backend && DB_PORT=<puerto> uv run pytest -q`
    (usuario y contraseña `postgres` por defecto).
- CI (`.github/workflows/ci.yml`):
  - Backend: `ruff check`, `ruff format --check`, migraciones al día y `pytest`
    contra un servicio de Postgres.
  - Frontend: `pnpm install --frozen-lockfile`, `lint`, `typecheck`, `test` y `build`.

## Decisiones y por qué
- **Decisión:** la base y Redis no publican puertos en el host.
  **Por qué:** en esta máquina corren otras apps con Postgres y Redis; además,
  así queda igual que en producción.
- **Decisión:** el admin y sus estáticos viven bajo `/api/` (`/api/admin/`,
  `/api/static/`).
  **Por qué:** una sola regla de proxy (`/api`) alcanza todo el backend, tanto en
  Vite como en nginx.
- **Decisión:** el TLS, la redirección a HTTPS y HSTS quedan en el proxy del VPS.
  **Por qué:** Django está detrás de dos proxies (nginx global y nginx del
  frontend). Confía en `X-Forwarded-Proto`, y `TRUSTED_PROXY_COUNT` fija cuántos
  proxies hay para leer la IP real.
- **Decisión:** Python 3.13 y Django 5.2 LTS.
  **Por qué:** 5.2 es LTS, con soporte hasta abril de 2028. Python 3.13 se eligió
  por prudencia con las dependencias; 3.14 queda por evaluar.

## Historial
- 2026-11-03: versión inicial (Fase 1). Puertos elegidos libres en la máquina
  de desarrollo: 8001 (backend) y 5173 (frontend).
- 2026-11-16: variables de email, enlaces, límites, alertas, histórico y VAPID
  (feature `cuenta-planes-alertas`); ver la sección al final.

## Variables del pronóstico público y de lugares (2026-11-03)
- `THROTTLE_PUBLIC_FORECAST_RATE`: límite por IP de `GET /api/pronostico/`.
  Viene en 60/hora porque una celda vencida cuesta unas 7 llamadas a Open-Meteo.
- `THROTTLE_PLACES_RATE`: límite por IP de `/api/lugares/` y `/reverso/`, que
  comparten el mismo contador.
- `GEOREF_API_URL`: URL de Georef AR, que es CC BY 4.0 y permite uso comercial.
- `PLACES_CACHE_SECONDS`: cuánto se cachean las búsquedas y la ubicación
  inversa. Viene en 1 día.

## Variables de cuenta, alertas e histórico (2026-11-16)
- `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`,
  `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS` y `DEFAULT_FROM_EMAIL`: envío de emails
  (fin de prueba, recuperación de contraseña y alertas). Vacío = valor por
  defecto: consola en desarrollo (los emails se ven en los logs) y SMTP en
  producción. `EMAIL_USE_TLS` solo toma "true" como verdadero.
- `PUBLIC_APP_URL`: origen público de la PWA, para los enlaces de los emails.
- `THROTTLE_PLANS_RATE`: límite por IP de `GET /api/planes/` (300/hora).
- `THROTTLE_PASSWORD_RESET_RATE`: límite por IP de
  `POST /api/auth/password/reset/` (5/hora), porque cada pedido manda un email.
- `ALERTS_MAX_FORECAST_AGE_HOURS`: un pronóstico más viejo no se evalúa (12).
- `OPEN_METEO_HISTORICAL_URL`: Historical Forecast API de Open-Meteo. El uso
  comercial requiere el plan Professional (prefijo `customer-` y clave).
- `LOTE_FORECAST_ON_CREATE`: un lote nuevo o movido pide el pronóstico de su
  celda en segundo plano en vez de esperar al próximo turno de 6 h (`true`).
- `HISTORY_BACKFILL_ON_CREATE`: un lote nuevo o movido carga 90 días de su
  celda en segundo plano (`true`).
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (secreta) y `VAPID_SUBJECT`: Web Push.
  Vacías = sin push (la bandeja y el email funcionan). Ver
  `funcionalidades/alertas.md` para generarlas.
- En desarrollo, los emails y las alertas los procesa Celery: hace falta
  `docker compose up -d worker beat`. Después de este cambio hay que
  reconstruir la imagen del backend (`docker compose up -d --build`) para
  instalar pywebpush.
