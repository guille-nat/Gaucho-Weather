# Planes, founders y prueba
> Última actualización: 2026-11-20

## Qué hace
Cada cuenta tiene uno de tres planes que limitan lotes, reglas de alerta y
canales. Los primeros 100 usuarios son founders: plan Productor gratis para
siempre. Desde el 101, cada alta recibe 30 días de Productor y después pasa a
Básico. Los planes pagos se cobran en pesos con Mercado Pago (ver
[pagos.md](pagos.md)).

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
- El precio arranca vacío y la página muestra "Precio a confirmar". Un precio de 0 se
  muestra como "Gratis", sin "/ mes".
- **Precios decididos (2026-11-17):** Básico gratis, Productor $ 14.900 / mes y Empresa
  $ 49.900 / mes. Se cargan en el admin (Planes → precio mensual); en desarrollo ya
  están cargados y el mock (`dev:mock`) usa los mismos. El modelo es freemium:
  - **Básico gratis** compite con las apps de clima agro gratuitas y es donde cae quien
    termina la prueba. Así nadie pierde el pronóstico ni sus 2 lotes.
  - **Productor** sale unos $ 1.000 por lote al mes con 15 lotes. Una sola helada o
    pulverización bien decidida lo paga muchas veces.
  - **Empresa** cuesta más de 3 veces Productor, así que Productor queda como la opción
    obvia. Es para contratistas y empresas con muchos lotes.
  - Referencia de mercado: casi todas las apps de clima agro en Argentina son gratis o
    no publican su precio. La única con precios en pesos (ClimaVista Agro, por
    hectárea, con un mes de prueba) tiene montos desactualizados. Los precios se
    revisan con la inflación desde el admin, sin tocar código.

### Moneda
- Cada plan tiene dos precios fijos: `price_ars_month` (pesos) y `price_usd_month`
  (dólares). Los dos se cargan en el admin y vacío significa "Precio a confirmar".
- **Decisión:** precios fijos en cada moneda, sin convertir con el dólar oficial ni el
  MEP. **Por qué:** el usuario decidió dar las dos opciones de pago y actualizar los
  precios cada 3 meses (precios-productor L9), así que no hace falta una API de
  cotización.
- Planes y Suscripción muestran un selector "Pesos" / "Dólares" arriba de las
  tarjetas. La elección se guarda en el dispositivo (`localStorage`, clave
  `gw-currency-v1`, en `frontend/src/lib/currency.ts`) y arranca en pesos. Si el
  navegador bloquea el almacenamiento, la elección dura solo esa visita.
- Las tarjetas muestran "$ 14.900 / mes" o "US$ 10 / mes". Un precio de 0 se muestra
  como "Gratis" en las dos monedas. Debajo del selector se lee: "Podés pagar en pesos o
  en dólares. Actualizamos los precios cada 3 meses."
- **Precios en dólares (2026-11-17):** Básico 0, Productor US$ 10 y Empresa US$ 35, en
  línea con los precios en pesos. En desarrollo y en el mock ya están cargados; en
  producción se cargan en el admin.

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
- Un founder sube a Empresa solo pagando la diferencia con Mercado Pago (ver
  [pagos.md](pagos.md)). `plans.refuse_free_empresa` lo frena en los otros caminos, con
  "Como founder, Empresa se paga con Mercado Pago: pagás solo la diferencia." (400): su pedido
  a Empresa, aplicar un pedido así en el backoffice (queda pendiente) y el cambio directo de
  plan en el backoffice. Volverlo a Productor a mano sigue funcionando. En el admin de Django
  el plan ya no se edita (cortesias S6).
  **Por qué:** decisión del usuario (promociones L5): "que nadie se la regale por error". Un
  pedido aplicado a Empresa lo dejaba con Empresa gratis para siempre.

### Prueba de Productor
- La tarea `accounts.expire_trials` corre todos los días a las 09:00 (beat,
  hora argentina). Pasa a Básico las pruebas vencidas y le manda un email al
  usuario con los límites reales de Básico y el enlace a `/planes`.
- Antes de las pruebas, la misma tarea termina las cortesías vencidas y manda el aviso de
  una semana antes (ver "Cortesías").
- Solo toca pruebas: Productor, sin número de founder, con vencimiento y sin cortesía
  activa. Un vencimiento que staff puso en otro plan queda para staff.
- Es idempotente, y si el email falla el cambio de plan no se deshace.

### Cortesías
- Un super admin da un plan pago gratis hasta una fecha (como mucho un año) desde el
  backoffice; es el único camino para regalar un plan pago. Una cuenta suma como máximo un
  año de cortesía en cualquier ventana de 2 años, y nunca va a un super admin ni a una cuenta
  bloqueada. Detalle de la API en
  [backoffice.md](backoffice.md#cortesías-cortesias-s1-s3).
- Modelo `Courtesy`; mientras está activa, `plan_expires_at` es su fecha de fin. Para
  `membership_status` una cuenta no founder en cortesía figura como `trial` (tiene
  vencimiento).
- Al vencer pasa a Básico (Productor para un founder) con motivo `courtesy_ended` y un email
  con el enlace a `/planes`; una semana antes, un aviso.
- Cualquier otro cambio de plan la termina (`plans._switch`). Por eso suscribirse durante
  una cortesía la termina sin mover el plan dos veces. `subscribe` acepta el mismo plan si la
  cuenta tiene vencimiento: un founder en cortesía de Empresa puede pagar Empresa.

### Cuentas con plan pago sin cobrar
Antes de las cortesías, el backoffice regalaba planes pagos sin vencimiento. Esas cuentas
quedaron como estaban. Para listarlas (`docker compose exec backend python manage.py shell`):

```python
from apps.accounts.models import User
from apps.payments.models import ProviderSubscription

paying = ProviderSubscription.objects.filter(ended_at=None).exclude(status="pending")
User.objects.filter(plan_expires_at=None, plan_id__in=["productor", "empresa"]).exclude(
    founder_number__isnull=False, plan_id="productor"
).exclude(pk__in=paying.values("user_id"))
```

Son las cuentas en Productor o Empresa sin vencimiento, sin suscripción que pague y que no son
founders en su Productor. En el backoffice se ven con `estado=active` y el plan, mirando sus
suscripciones en la ficha.

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
  `{plans: [...], founders: {limit, remaining}, trial_days, payments_enabled,
  founder_empresa_price_ars}`.
- `GET /api/auth/me/` suma `plan`, `plan_expires_at`, `founder_number` y
  `usage` (`{lotes, alert_rules}`). Ver [cuenta.md](cuenta.md).
- Página pública `/planes` (`frontend/src/pages/Planes.tsx`): tres tarjetas,
  Productor en el medio y destacado, el contador "Quedan N lugares de
  founder", el plan actual marcado y "Próximamente" como botón.

### Suscripción
- Modelos: `PlanChange` (historial: plan anterior, plan nuevo, motivo, fecha,
  quién y nota) y `PlanRequest` (pedido de cambio o de baja a Básico, con
  estado `pending`, `applied`, `rejected` o `withdrawn`). Un usuario tiene como
  mucho un pedido pendiente (restricción única condicional).
- Se registra un `PlanChange` en el alta (`founder` o `trial`, en
  `start_membership`), al vencer la prueba (`trial_ended`, en
  `expire_trials`), al aplicar un pedido (`request`) y cuando el equipo cambia el
  plan desde el backoffice (`staff`). Una cortesía suma `courtesy` al darla y
  `courtesy_ended` al vencer o revocarla. Los pedidos y el backoffice pasan por
  `plans.change_plan`, que borra el vencimiento.
- En el admin de Usuarios, `plan` y `plan_expires_at` son de solo lectura (cortesias S6).
  **Por qué:** decisión del usuario, "Un solo camino, todo con vencimiento": el admin
  cambiaba el plan sin dejar fila en el registro del backoffice y sin vencimiento.
  (reemplaza el cambio de plan desde el admin, 2026-11-20.)
- API (sesión + CSRF):
  - `GET /api/auth/suscripcion/` → `{plan, status, founder_number,
    trial_ends_at, usage, pending_request, history}`. `status` es `founder` si
    tiene número, `trial` si tiene vencimiento, si no `active`. `history` va
    del más nuevo al más viejo.
  - `POST /api/auth/suscripcion/pedido/` con `{kind: "change", plan}` o
    `{kind: "cancel"}` → 201 con el pedido. Errores 400: "Ya estás en el plan
    <Nombre>.", "Ya tenés un pedido pendiente.", "Ese plan no existe.", y para un
    founder que pide Empresa "Como founder, Empresa se paga con Mercado Pago: pagás solo
    la diferencia."
  - `DELETE /api/auth/suscripcion/pedido/` → 204 (retira el pedido); 404 "No
    tenés un pedido pendiente." si no hay.
- Admin, "Pedidos de plan": acciones "Aplicar pedidos seleccionados" y
  "Rechazar pedidos seleccionados". Aplicar cambia el plan, registra el
  historial y, después del commit, manda el email "Tu plan ahora es <Nombre>"
  con el enlace a `/perfil/suscripcion`. Si el email falla, el cambio queda.
  Los pedidos que ya no están pendientes se omiten.
- La ficha del usuario en el admin muestra el historial de planes (solo
  lectura).

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
- **Decisión:** planes sin cobro por ahora. (reemplazada el 2026-11-19 por el cobro
  en pesos con Mercado Pago, ver [pagos.md](pagos.md))
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

- **Decisión:** los pedidos de cambio o baja se registran y staff los aplica
  en el admin.
  **Por qué:** pedido del usuario ("falta el apartasdo de manejo de
  subsicripciones", eligió «Mi suscripción (plan)»); sin pago todavía, nadie
  puede cambiar de plan solo.
- **Decisión:** la migración `0007_seed_plan_history` solo reconstruye lo
  seguro: founders (`founder`) y pruebas (`trial`), con fecha `date_joined`.
  **Por qué:** del resto (Básico después de una prueba, staff, planes puestos
  por staff) nunca se guardó cuándo ni por qué cambió; un registro inventado
  sería falso. Esas cuentas arrancan con historial vacío.
  **Alternativas descartadas:** registrar `staff` con fecha `date_joined`.
  El reverse borra solo las filas sembradas (nota "Reconstruido al crear el
  historial de planes.").
- **Decisión:** dar de baja es pedir pasar a Básico, no borrar la cuenta.
  **Por qué:** S14: "cancel down to Básico". Borrar la cuenta está en
  [cuenta.md](cuenta.md).

## Cómo modificarlo
- Límites, precios (pesos y dólares), push, soporte, destacado y orden se editan en el admin
  (`/api/admin/`, Planes). El cupo de founders y los días de prueba, en
  "Programa founders". El plan de cada usuario, desde el backoffice (en el admin es de solo
  lectura).
- Un plan nuevo con límite: sumar el campo en `Plan`, el caso en `LIMITS` y la
  llamada a `check_limit` en la vista que crea.
- Tests: `backend/tests/test_plans.py` (incluye la concurrencia de founders) y
  `backend/tests/test_subscription.py` (historial, pedidos, admin y migración).

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
- 2026-11-16: suscripción (S14): historial de cambios de plan, pedidos de
  cambio o baja, API `/api/auth/suscripcion/`, acciones del admin y migración
  que siembra el historial de las cuentas existentes.

- 2026-11-16 — Quien está en la prueba puede pedir quedarse con Productor ("Quedarme con Productor" en `/perfil/suscripcion`): pedir el mismo plan en una prueba significa conservarlo; al aplicarlo se borra el vencimiento y queda en el historial como pedido aplicado.
- 2026-11-17 — Precios: Básico gratis, Productor $ 14.900 y Empresa $ 49.900 por mes;
  "Gratis" en lugar de "$ 0"; tarjetas de precios con Productor como "El más elegido"
  (feature `precios-productor`).
- 2026-11-17 — Moneda: precio fijo en dólares por plan (`price_usd_month`, migración
  `0008_plan_price_usd`) y selector "Pesos" / "Dólares" en Planes y Suscripción
  (feature `precios-productor`, S5).
- 2026-11-19 — Cobro: los planes pagos se cobran en pesos con Mercado Pago; el plan
  cambia con los motivos `payment` y `payment_ended` (feature `pagos-backoffice`, T1;
  ver [pagos.md](pagos.md)).
- 2026-11-19 — Pantalla Planes: con pagos habilitados, un plan pago muestra "Suscribirme" y
  lleva a Suscripción. No lo muestra en Básico, para un founder ni en el plan que ya se paga; una
  cuenta en prueba lo ve bajo su aviso de prueba. Sin pagos sigue "Próximamente" (pagos-backoffice
  S8).
- 2026-11-19 — Founder a Empresa: un founder ve "Suscribirme" solo en Empresa, con "Como founder
  pagás solo la diferencia: $35.000 por mes." (monto de `founder_empresa_price_ars`); paga solo
  la diferencia, vuelve a Productor al darse de baja, y no puede recibir Empresa por pedido ni
  a mano en el backoffice (promociones SF).
- 2026-11-20 — Cortesías: un plan pago gratis hasta una fecha de como mucho un año, con motivo
  y tope de 20 activas; el cambio de plan del backoffice solo baja al plan gratis
  (feature `cortesias`, S1-S4).
- 2026-11-20 — Cortesías, correcciones (T3): "1 año en 2 años" por cuenta (cualquier ventana de
  730 días suma como máximo 365 de cortesía), el tope de 20 aguanta altas simultáneas, y el plan
  y su vencimiento son de solo lectura en el admin de Django.
