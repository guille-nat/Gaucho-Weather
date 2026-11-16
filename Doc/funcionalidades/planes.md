# Planes, founders y prueba
> Última actualización: 2026-11-16

## Qué hace
Cada cuenta tiene uno de tres planes que limitan lotes, reglas de alerta y
canales. Los primeros 100 usuarios son founders: plan Productor gratis para
siempre. Desde el 101, cada alta recibe 30 días de Productor y después pasa a
Básico. Todavía no se cobra: no hay pasarela de pago.

## Cómo funciona

### Los tres planes

| Plan | Lotes | Reglas de alerta | Push | Otros |
|---|---|---|---|---|
| Básico | 2 | 3 | no (sí bandeja y email) | — |
| Productor (destacado, "Recomendado") | 15 | sin límite | sí | — |
| Empresa | sin límite | sin límite | sí | soporte prioritario |

- Modelos en `backend/apps/accounts/models.py`: `Plan` (código `basico`,
  `productor` o `empresa`), `FounderProgram` (una sola fila, pk=1: cupo,
  próximo número y días de prueba) y los campos de `User`: `plan`,
  `plan_expires_at`, `founder_number`, `notify_push` y `notify_email`.
- Lógica en `backend/apps/accounts/plans.py`. Los valores por defecto están en
  `DEFAULT_PLANS` y los siembra la migración `0003_seed_plans` (hay que
  mantener los dos iguales).
- El precio arranca vacío y la página muestra "Precio a confirmar".

### Founders
- `start_membership` corre dentro de la transacción del registro. Bloquea la
  fila de `FounderProgram` con `select_for_update`, así dos altas simultáneas
  toman números consecutivos y nunca el mismo.
- Si queda cupo, el usuario recibe el número `#N`, Productor y sin vencimiento.
  Si no, recibe Productor con `plan_expires_at = ahora + trial_days`.
- Un lugar de founder nunca se reasigna: al borrar la cuenta, `next_number` no
  baja.
- La migración `0005_backfill_founders` convirtió en founders a los usuarios
  que ya existían, del más antiguo al más nuevo (`date_joined`, `id`). Los staff
  nunca toman un lugar.

### Prueba de Productor
- La tarea `accounts.expire_trials` corre todos los días a las 09:00 (beat,
  hora argentina). Pasa a Básico las pruebas vencidas y le manda un email al
  usuario con los límites reales de Básico y el enlace a `/planes`.
- Solo toca pruebas: Productor, sin número de founder y con vencimiento. Un
  vencimiento que staff puso en otro plan queda para staff.
- Es idempotente, y si el email falla el cambio de plan no se deshace.

### Límites
- `check_limit(user, kind)` corre en la transacción que crea el lote o la
  regla, con la cuenta bloqueada, para que dos creaciones en paralelo no pasen
  las dos el conteo.
- Al superar el límite responde **402**
  `{"detail": "Tu plan Básico permite hasta 2 lotes. Mirá los planes para sumar más.", "code": "plan_limit"}`.
- El frontend lo reconoce con `isPlanLimit()` y muestra el mensaje con un
  enlace a Ver planes.

### API y pantalla
- `GET /api/planes/` (público, límite `THROTTLE_PLANS_RATE`):
  `{plans: [...], founders: {limit, remaining}, trial_days}`.
- `GET /api/auth/me/` suma `plan`, `plan_expires_at`, `founder_number` y
  `usage` (`{lotes, alert_rules}`). Ver [cuenta.md](cuenta.md).
- Página pública `/planes` (`frontend/src/pages/Planes.tsx`): tres tarjetas,
  Productor en el medio y destacado, el contador "Quedan N lugares de
  founder", el plan actual marcado y "Próximamente" como botón.

## Decisiones y por qué
- **Decisión:** tres planes con el del medio destacado, uno barato con límites
  y uno caro.
  **Por qué:** pedido del usuario: "Debe de haber 3 planes con uno en el medio,
  destacado como el preferido y uno muy caro y otro muy barato pero con
  limitaciones, lo que resuelve mas dolencia debe de ser el del medio para que
  se tienda a elegir".
- **Decisión:** los planes se diferencian por canal (push) y por cantidad de
  lotes y reglas.
  **Por qué:** decisión del plan aprobado ("Reparto por canal y lotes").
- **Decisión:** los founders reciben Productor gratis para siempre.
  **Por qué:** pedido del usuario: "los primeros 100 usuarios seran founders y
  no se les cobrara nada".
- **Decisión:** planes sin cobro por ahora.
  **Por qué:** decisión del plan aprobado ("Planes sin cobro"); el pago con
  Mercado Pago queda para una fase posterior. Mientras tanto, staff cambia
  planes desde el admin.
- **Decisión:** 30 días de prueba de Productor desde el usuario 101.
  **Por qué:** decisión del plan aprobado ("Prueba de Productor").
- **Decisión:** el límite responde 402, no 403.
  **Por qué:** `frontend/src/query/client.ts` trata cualquier 403 que no sea de
  CSRF como sesión perdida y cierra la sesión.
  **Alternativas descartadas:** 403, por ese motivo.
- **Decisión:** al bajar de plan no se borra nada.
  **Por qué:** se bloquea crear más, y las reglas que exceden el límite quedan
  pausadas (`paused_by_plan`): cuentan las más antiguas hasta el límite
  (`rule_ids_within_plan`). Al volver a subir de plan, se reactivan solas.
- **Decisión:** las reglas desactivadas cuentan para el límite.
  **Por qué:** coherente con el mensaje de alta ("Hasta 3 reglas").
- **Decisión:** el número de founder se asigna con bloqueo de fila.
  **Por qué:** sin `select_for_update` el test de concurrencia falló 3 de 3
  veces (prueba de mutación).

## Cómo modificarlo
- Límites, precio, push, soporte, destacado y orden se editan en el admin
  (`/api/admin/`, Planes). El cupo de founders y los días de prueba, en
  "Programa founders". El plan y el vencimiento de cada usuario, en Usuarios.
- Un plan nuevo con límite: sumar el campo en `Plan`, el caso en `LIMITS` y la
  llamada a `check_limit` en la vista que crea.
- Tests: `backend/tests/test_plans.py` (incluye la concurrencia de founders).

### Pendientes
- **Cobro:** Mercado Pago en una fase posterior; hoy el botón dice
  "Próximamente".
- **Cupo de founders sin verificación de email** (advisory R1-001): el registro
  no verifica el email, así que bots desde muchas IPs podrían agotar los 100
  lugares. Queda para decidir con el usuario.
- Un usuario creado desde el admin queda en Básico y sin lugar de founder.
- `EMAIL_USE_TLS` solo acepta "true" como verdadero.

## Historial
- 2026-11-16: versión inicial (feature `cuenta-planes-alertas`, T1 y T2).
