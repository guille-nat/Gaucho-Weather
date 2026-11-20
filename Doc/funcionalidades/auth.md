# Autenticación
> Última actualización: 2026-11-19

## Qué hace
Alta, ingreso y salida con email y contraseña. La sesión vive en una cookie del
servidor (httpOnly) y dura 60 días, renovándose con cada uso.

## Cómo funciona
- App `backend/apps/accounts/`. Modelo `User` propio con el email como
  identificador (sin `username`) y `name`.
- Endpoints bajo `/api/auth/`:

  | Método y ruta | Respuesta |
  |---|---|
  | `GET csrf/` | 204 y setea la cookie `csrftoken` |
  | `POST register/` `{email, password, name, acepta_terminos}` | 201 `User` y deja la sesión iniciada; sin `acepta_terminos: true` → 400 (ver [terminos.md](terminos.md)) |
  | `POST login/` `{email, password}` | 200 `User`; credenciales malas → 400 `{"detail": "Email o contraseña incorrectos."}` |
  | `POST logout/` | 204 (también sin sesión) |
  | `GET me/` | 200 `User`, o 403 sin sesión |
  | `POST terminos/aceptar/` | 200 `User`; acepta la versión vigente de los términos |

  `User` = `{id, email, name}`. Desde el 2026-11-16 suma `plan`,
  `plan_expires_at`, `founder_number`, `usage`, `notify_push` y `notify_email`
  (campos agregados, ver [planes.md](planes.md)). Desde el 2026-11-19 suma
  `terms_version` y `terms_accepted` (ver [terminos.md](terminos.md)).
- La gestión de la cuenta (`PATCH` y `DELETE me/`, `password/change/`,
  `password/reset/` y `password/reset/confirm/`) está en [cuenta.md](cuenta.md).
- Todo método que modifica (POST, PATCH, DELETE) exige el header `X-CSRFToken`
  con el valor de la cookie `csrftoken`, incluso en login y registro. Sin token
  responde 403 `{"detail": "Token CSRF ausente o inválido. Recargue la página e intente de nuevo."}`.
- Login y registro tienen límite por IP: `THROTTLE_LOGIN_RATE` (10/min) y
  `THROTTLE_REGISTER_RATE` (10/hora). Al superarlo responde 429.

## Decisiones y por qué
- **Decisión:** sesión de Django con CSRF en lugar de JWT.
  **Por qué:** evita la carrera al renovar el JWT de la v1 (ver
  `plan-reescritura.md`). Frontend y API comparten origen, así que la cookie
  alcanza.
- **Decisión:** usuario propio con email desde la primera migración.
  **Por qué:** cambiar el modelo de usuario después obliga a migraciones manuales.
- **Decisión:** el CSRF también se valida en login y registro.
  **Por qué:** DRF solo lo valida con sesión iniciada; sin esto un sitio ajeno
  podría iniciar sesión con una cuenta suya en el navegador del usuario.
- **Decisión:** el límite de registro se cuenta por IP aunque el pedido tenga sesión.
  **Por qué:** el registro inicia sesión, y contar por usuario daba un cupo nuevo
  en cada alta.
- **Decisión:** `LANGUAGE_CODE = "es"`.
  **Por qué:** los mensajes de validación de Django y DRF llegan ya en español.

## Cómo modificarlo
- Detrás de proxies, `TRUSTED_PROXY_COUNT` define cuántos hay para leer la IP
  real en `X-Forwarded-For`. Mal configurado, todos los usuarios comparten el límite.
- El login por código de WhatsApp queda para la Fase 3.
- Tests: `backend/tests/test_auth.py`.

## Historial
- 2026-11-03: versión inicial (Fase 1).
- 2026-11-16: `User` con plan, uso y preferencias; nuevos endpoints de cuenta y
  recuperación de contraseña, documentados en [cuenta.md](cuenta.md). Los pedidos
  que comprueban una contraseña comparten el límite de login (feature
  `cuenta-planes-alertas`).
- 2026-11-19: el alta exige aceptar los términos; `me/` dice si la cuenta aceptó la versión
  vigente y `terminos/aceptar/` la acepta (feature `promociones`, S0b–S0c).
