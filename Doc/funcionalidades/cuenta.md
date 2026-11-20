# Gestión de cuenta
> Última actualización: 2026-11-16

## Qué hace
El usuario ve su plan y su uso, cambia nombre, email y preferencias de aviso,
cambia la contraseña, la recupera por email si la olvidó y puede borrar su
cuenta. El alta, el ingreso y la sesión están en [auth.md](auth.md); los planes,
en [planes.md](planes.md).

## Cómo funciona

### Endpoints (bajo `/api/auth/`)

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET me/` | — | 200 `User` con `plan`, `plan_expires_at`, `founder_number`, `usage`, `notify_push`, `notify_email` |
| `PATCH me/` | `name`, `email` (+ `current_password`), `notify_push`, `notify_email` | 200 `User`. Los campos del plan son de solo lectura |
| `DELETE me/` | `password` | 204 y cierra la sesión |
| `POST password/change/` | `current_password`, `new_password` | 204 |
| `POST password/reset/` | `email` | siempre 204 |
| `POST password/reset/confirm/` | `uid`, `token`, `new_password` | 204, o 400 `{"detail": "El enlace no es válido o venció. Pedí uno nuevo."}` |

Código: `backend/apps/accounts/views.py`, `serializers.py`,
`password_reset.py` y `tasks.py`. Todos exigen CSRF, igual que el resto de la
API.

### Editar datos y preferencias
- Cambiar el email pide `current_password`. La contraseña se valida **antes**
  de mirar si el email nuevo ya está en uso.
- El email se guarda en minúsculas y la unicidad se compara sin distinguir
  mayúsculas.

### Cambiar la contraseña
- Valida la actual y la nueva con los validadores de Django.
- Mantiene esta sesión (`update_session_auth_hash`) y cierra todas las demás.

### Recuperar la contraseña
1. `POST password/reset/` encola la tarea Celery `accounts.send_password_reset`
   y responde 204, exista o no la cuenta.
2. La tarea manda un enlace `PUBLIC_APP_URL/restablecer/<uid>/<token>`, solo si
   hay una cuenta activa con ese email y no se le mandó otro en los últimos 10
   minutos (`cache.add` por usuario, `EMAIL_COOLDOWN`).
3. El enlace vence en 1 h (`PASSWORD_RESET_TIMEOUT`) y sirve una sola vez.
   `password/reset/confirm/` cambia la contraseña, lo que cierra todas las
   sesiones.
- Un ingreso también invalida los enlaces pendientes, porque el token de Django
  incluye `last_login`.
- Si el broker está caído, igual responde 204 y deja el error en el log.
- Fallas de SMTP (`OSError`): la tarea reintenta hasta 3 veces con backoff.

### Borrar la cuenta
- Pide la contraseña. Borra en cascada lotes, reglas, alertas y suscripciones
  push, y cierra la sesión.
- El lugar de founder no se libera (ver [planes.md](planes.md)).

### Límite de intentos

| Pedido | Límite |
|---|---|
| Lo que comprueba una contraseña: `PATCH me/` con `current_password`, `DELETE me/`, `password/change/`, `password/reset/confirm/` | comparte el contador de login por IP (`THROTTLE_LOGIN_RATE`, 10/min) |
| `GET me/` y `PATCH me/` sin contraseña (nombre, preferencias) | sin límite |
| `password/reset/` | `THROTTLE_PASSWORD_RESET_RATE` (5/hora por IP) |

### Frontend
- `/perfil` (`Perfil.tsx`), por secciones: Tu plan (uso, línea de founder o días
  de prueba, Ver planes), Tus datos, Cómo te avisamos (switches de push y email;
  push deshabilitado en planes sin push), Contraseña y Borrar cuenta (dentro de
  un `details`). Si el push está activo pero este teléfono no está suscripto,
  lo avisa.
- Después de borrar, el login muestra "Borramos tu cuenta, sus lotes y sus
  alertas."
- `/recuperar` (`Recuperar.tsx`): muestra la misma respuesta haya o no cuenta.
  El login enlaza "¿Olvidaste tu contraseña?".
- `/restablecer/:uid/:token` (`Restablecer.tsx`): ante un enlace inválido
  ofrece "Pedir otro enlace".

## Decisiones y por qué
- **Decisión:** al cambiar el email, la contraseña se comprueba primero.
  **Por qué:** antes un PATCH con sesión revelaba si un email tenía cuenta sin
  saber la contraseña. Los dos órdenes quedaron fijados por tests.
- **Decisión:** solo los pedidos que comprueban una contraseña consumen el
  contador de login.
  **Por qué:** cambiar el nombre o las preferencias consumía intentos de login
  sin motivo.
- **Decisión:** el pedido de recuperación siempre responde 204 y el email sale
  de una tarea.
  **Por qué:** ni la respuesta ni su demora dicen si existe la cuenta.
- **Decisión:** un email de recuperación cada 10 minutos por dirección, sin
  importar la IP.
  **Por qué:** el límite por IP no alcanza: rotando IPs se podía inundar la
  casilla de alguien o dañar la reputación del remitente (advisory R1-001 de la
  revisión).
- **Decisión:** con el broker caído, el pedido igual responde 204.
  **Por qué:** un 500 distinguiría "encolado" de "cola caída" y rompería la
  respuesta única. Staff se entera por el log (advisory R4-001).
- **Decisión:** borrar la cuenta no libera el lugar de founder.
  **Por qué:** el cupo cuenta altas, no cuentas vivas (ver [planes.md](planes.md)).
- **Decisión:** `ScopedRateThrottle` toma el scope de `view.throttle_scope`.
  **Por qué:** el test del límite encontró que DRF no lee el atributo de la
  clase del throttle; por eso `PasswordCheckThrottle` usa el scope de la vista.

## Cómo modificarlo
- Textos del email de recuperación: `SUBJECT` y `BODY` en `password_reset.py`.
- En desarrollo los emails se imprimen en los logs del worker (backend de
  consola). Hace falta `docker compose up -d worker beat`.
- Tests: `backend/tests/test_account.py` y `test_password_reset.py`.

### Pendientes
- Al cambiar el email no se avisa a la dirección anterior.
- Dos altas o cambios simultáneos al mismo email responden 500 (igual que el
  registro).

## Historial
- 2026-11-16: versión inicial (feature `cuenta-planes-alertas`, T3, T4 y T5).
- 2026-11-19: el aviso de por qué se salió ("Borramos tu cuenta…", sesión cerrada) ya no se pierde si el guard de rutas privadas redirige antes que Perfil: el motivo también queda en memoria (`frontend/src/lib/signedOut.ts`) hasta que lo muestra el login.
