# Gaucho Weather

Pronóstico del tiempo y **riesgo de heladas** para el campo argentino.

No es otra app del clima. Una helada arruina una cosecha, y saberlo con 48 horas
de anticipación cambia la decisión de sembrar, cosechar o pulverizar. Ese cálculo
—y las alertas que dispara— es el centro del producto.

---

## Índice

- [Arquitectura](#arquitectura)
- [Puesta en marcha](#puesta-en-marcha)
- [Variables de entorno](#variables-de-entorno)
- [API](#api)
- [Alertas de helada](#alertas-de-helada)
- [Tests](#tests)
- [Documentación relacionada](#documentación-relacionada)

---

## Arquitectura

```
┌──────────────┐     ┌──────────────┐     ┌───────────────┐
│   Frontend   │────▶│   Backend    │────▶│  Tomorrow.io  │
│ React 19     │     │ Django 5.1   │     │  (pronóstico) │
│ Vite 6       │     │ DRF + JWT    │     └───────────────┘
│ Redux Toolkit│     └──────┬───────┘     ┌───────────────┐
└──────────────┘            │             │ Google Geocode│
                            │             │  (ubicación)  │
                    ┌───────┴───────┐     └───────────────┘
                    │               │
              ┌─────▼─────┐   ┌─────▼─────┐
              │ PostgreSQL│   │   Redis   │
              │ (usuarios)│   │  (caché)  │
              └───────────┘   └───────────┘
```

**Por qué no se guarda el clima en la base:** los datos vienen de Tomorrow.io y
se cachean en Redis (30 min el clima actual, 1 hora el pronóstico). Persistirlos
agregaría un problema de sincronización sin resolver ninguno. Por eso
`weather/models.py` está vacío a propósito.

**Por qué el cacheo es explícito por vista:** el cacheo global de Django usa la
URL como clave. Como la API autentica con JWT en el header `Authorization` y no
con cookie, Django no agrega `Vary: Cookie` y una respuesta autenticada se
serviría a cualquier otro usuario. Ver [SECURITY.md](SECURITY.md).

### Estructura

```
BackEnd/
  weather_backend/
    config/           base.py · developer.py · production.py · testing.py
    settings.py       elige el entorno según DJANGO_ENV
    urls.py           ruteo raíz
    health.py         /healthz y /readyz
  weather/            pronóstico, clima actual y riesgo de helada
  users/              cuentas, preferencias, verificación, recupero, alertas
  migrations/         MIGRATION_MODULES apunta acá, no a cada app

FrontEnd/
  src/
    components/       una carpeta por componente, con su style/
    services/         clientes HTTP (axios + interceptor de refresh)
    redux/slices/     auth y preferencias de usuario
    styles/           index.css tiene los design tokens
    guards/           protección de rutas privadas

nginx/                reverse proxy del VPS (TLS, ruteo, rate limit)
```

---

## Puesta en marcha

### Requisitos

- Docker y Docker Compose
- Una clave de [Tomorrow.io](https://www.tomorrow.io/weather-api/)
- Una clave de Google Maps con **Geocoding API** y **Places API** habilitadas

### Desarrollo

```bash
git clone <repo> && cd Gaucho-Weather

cp .env.example .env
# Completá SECRET_KEY, SECRET_KEY_JWT, TOMORROW_API_KEY, GOOGLE_MAPS_API_KEY
# y poné DJANGO_ENV=developer

# Generar los secretos:
python3 -c "import secrets; print(secrets.token_urlsafe(64))"

docker compose up --build
```

| Servicio   | URL                        |
|------------|----------------------------|
| Frontend   | http://localhost:5174      |
| Backend    | http://localhost:8001      |
| Salud      | http://localhost:8001/healthz |
| PostgreSQL | localhost:5433             |
| Redis      | localhost:6380             |

Primera vez, para crear las tablas y un administrador:

```bash
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
```

Para ver la documentación de la API, poné `ENABLE_API_DOCS=true` en `.env` y
entrá a http://localhost:8001/api/doc. Queda **apagada por defecto**: publica
toda la superficie de la API.

### Producción

Ver **[DEPLOYMENT.md](DEPLOYMENT.md)** — instalación en un VPS, TLS, backups y
el runbook de deploy.

---

## Variables de entorno

Todas viven en `.env`, que **nunca se commitea**. La plantilla completa y
comentada está en [`.env.example`](.env.example).

Las obligatorias: si falta alguna, el proceso **no arranca**. Es deliberado —
es preferible un deploy fallido a un servicio corriendo con un secreto vacío.

| Variable | Para qué |
|----------|----------|
| `DJANGO_ENV` | `production`, `developer` o `testing` |
| `SECRET_KEY` | Firma de sesiones y tokens de recupero |
| `SECRET_KEY_JWT` | Firma de los JWT (separada a propósito) |
| `TOMORROW_API_KEY` | Proveedor del pronóstico |
| `GOOGLE_MAPS_API_KEY` | Geocodificación inversa (backend) |
| `ALLOWED_HOSTS` | Hosts que sirven la app. Sin comodines |
| `CORS_ALLOWED_ORIGINS` | Orígenes del frontend. Sin comodines |

### Sobre `VITE_GOOGLE_MAPS_API_KEY`

Vite congela esta variable **dentro del bundle** durante el build. Es pública
por naturaleza: cualquiera puede leerla desde el navegador. No es un descuido,
es cómo funciona Google Maps en el cliente. Protegela restringiéndola **por
referrer HTTP** en la consola de Google Cloud, y usá una clave distinta de la
del backend, que sí se restringe por IP.

---

## API

Base: `/api`

### Clima (público)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/weather/weathers-now/` | Condiciones actuales |
| GET | `/api/weather/weathers-days/` | Pronóstico de 6 días (diario y horario) |
| GET | `/api/weather/frost-risk/` | **Riesgo de helada por día** |

Parámetros: `location` (con `+` por espacios) **o** `lat` + `lon`, y
opcionalmente `units` (`metric` o `imperial`).

```bash
curl "http://localhost:8001/api/weather/frost-risk/?lat=-32.47&lon=-61.57"
```

```json
{
  "location": {"lat": -32.47, "lon": -61.57, "name": "Las Rosas, Santa Fe"},
  "units": "metric",
  "days": [
    {
      "date": "2026-08-01T09:00:00Z",
      "probability": 85,
      "risk_level": "severe",
      "temperature_min": -2.0,
      "dew_point": -4.0,
      "humidity": 90,
      "cloud_cover": 10
    }
  ]
}
```

`risk_level`: `none` · `low` (≥10) · `moderate` (≥30) · `high` (≥50) · `severe` (≥70)

### Autenticación

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/token` | Obtener access + refresh |
| POST | `/api/token/refresh` | Renovar el access |
| POST | `/api/users/register` | Crear cuenta (dispara el correo de verificación) |
| POST | `/api/users/verify-email` | Confirmar la casilla con el token |
| POST | `/api/users/resend-verification` | Reenviar el correo |
| POST | `/api/users/password-reset` | Pedir recupero |
| POST | `/api/users/password-reset/confirm` | Fijar la nueva contraseña |

### Cuenta (requiere JWT)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/users/profiles` | Perfil y preferencias |
| PATCH | `/api/users/update` | Actualizar datos |
| PATCH | `/api/users/update-preferences` | Ubicaciones favoritas, unidades, alertas |
| GET | `/api/users/frost-alerts` | Historial de alertas recibidas |

### Salud

| Ruta | Para qué |
|------|----------|
| `/healthz` | Liveness. Responde sin tocar dependencias |
| `/readyz` | Readiness. Verifica base y caché; devuelve 503 si algo falla |

---

## Alertas de helada

`UserPreferences.alerts_enabled` activa el aviso por correo. El comando revisa
las ubicaciones favoritas y notifica cuando el riesgo supera el umbral:

```bash
docker compose exec backend python manage.py send_frost_alerts

# Opciones
--threshold 50   # probabilidad mínima para avisar (0-100)
--days 3         # cuántos días del pronóstico mirar
--dry-run        # calcula y reporta sin enviar nada
```

Es **idempotente**: `FrostAlert` guarda usuario + localidad + día con una
restricción única, así que volver a correrlo no reenvía el mismo aviso. Solo
avisa a cuentas con el correo verificado, para que el sistema no sirva de
disparador de spam a direcciones ajenas.

Cron sugerido (dos veces al día, antes de las horas críticas):

```cron
0 18,4 * * * cd /opt/gaucho-weather && docker compose -f docker-compose.prod.yml exec -T backend python manage.py send_frost_alerts >> /var/log/gaucho-frost.log 2>&1
```

---

## Tests

```bash
# Backend (sin dependencias externas: sqlite en memoria y caché local)
docker compose exec backend env DJANGO_ENV=testing python manage.py test

# Frontend
cd FrontEnd && npm run lint && npm run build
```

La suite cubre lo que puede lastimar en producción: aislamiento de respuestas
entre usuarios, hasheo de contraseñas, validación de registro, flujos de
verificación y recupero, el cálculo de heladas y el comportamiento de la caché.
Varios tests son **regresiones de bugs reales**: cada uno documenta en su
docstring qué fallaba.

CI corre en cada push y PR: higiene del repo → tests de backend → lint y build
de frontend → construcción de las imágenes de producción.

---

## Documentación relacionada

| Documento | Contenido |
|-----------|-----------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Instalación en VPS, TLS, backups, rollback |
| [SECURITY.md](SECURITY.md) | Hallazgos de seguridad y qué queda pendiente |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Convenciones de código y de commits |
| [.env.example](.env.example) | Referencia completa de variables |
