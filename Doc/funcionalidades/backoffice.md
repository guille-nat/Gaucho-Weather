# Backoffice
> Última actualización: 2026-11-20

## Qué hace
Una API para que los super admins administren cuentas, pedidos de plan y precios sin entrar
al admin de Django, y hagan cambios a mano en una cuenta desde su ficha. La usa la pantalla `/backoffice` del frontend. Vive en
`backend/apps/backoffice` y responde bajo `/api/backoffice/`.

## Quién puede entrar
Solo las cuentas con `is_superuser`. Hay dos formas de tener una:

- crearla con `docker compose exec backend python manage.py createsuperuser`;
- marcar "Superusuario" (`is_superuser`) en la cuenta desde el admin de Django
  (`/api/admin/`, Usuarios → Permisos).

Ser `is_staff` no alcanza. **Por qué:** el staff puede entrar a partes del admin, pero el
backoffice cambia el plan y los precios de todas las cuentas, así que se exige el permiso más
alto. Toda la API pasa por una sola clase de permiso, `IsSuperuser`
(`apps/backoffice/permissions.py`), para que ningún endpoint nuevo quede abierto por olvido.

- Sin sesión: 403 (la autenticación por cookie de sesión no pide credenciales con 401).
- Con sesión pero sin `is_superuser`: 403 con
  `{"detail": "Solo los super admins pueden usar el backoffice."}`.

`GET /api/auth/me/` incluye `is_superuser`, para que el frontend muestre el enlace al
backoffice solo a quien puede usarlo. El campo es de solo lectura.

## Endpoints

| Método y ruta | Qué hace |
|---|---|
| `GET resumen/` | Totales de cuentas, cupos de founder libres, pedidos pendientes, altas de los últimos 30 días e ingresos en pesos. |
| `GET cuentas/?q=&plan=&estado=&page=` | Lista paginada de cuentas. |
| `GET cuentas/{id}/` | Ficha de una cuenta: perfil, historial de planes, suscripciones, pagos, lotes y alertas. |
| `PATCH cuentas/{id}/` | Edita nombre y/o email. |
| `POST cuentas/{id}/plan/` | Baja la cuenta a su plan gratis (Básico, o Productor para un founder). |
| `POST cuentas/{id}/bloquear/` y `desbloquear/` | Bloquea o desbloquea la cuenta (`is_active`). |
| `POST cuentas/{id}/superadmin/dar/` y `superadmin/quitar/` | Da o quita super admin (`is_superuser` e `is_staff`). |
| `POST cuentas/{id}/restablecer-contrasena/` | Manda el mail para restablecer la contraseña. |
| `POST cuentas/{id}/prueba/` | Da o extiende la prueba de Productor hasta una fecha. |
| `POST cuentas/{id}/cortesia/` | Da una cortesía (un plan pago gratis hasta una fecha) o cambia la activa. |
| `DELETE cuentas/{id}/cortesia/` | Revoca la cortesía activa. |
| `POST cuentas/{id}/founder/dar/` y `founder/quitar/` | Marca o quita founder. |
| `POST cuentas/{id}/suscripcion/sincronizar/` | Vuelve a pedirle a Mercado Pago la última suscripción y sus cobros. |
| `POST cuentas/{id}/suscripcion/cancelar/` | Cancela la suscripción en Mercado Pago. |
| `GET pedidos/?page=` | Pedidos de plan pendientes, del más viejo al más nuevo. |
| `POST pedidos/{id}/aplicar/` | Aplica un pedido pendiente. |
| `POST pedidos/{id}/rechazar/` | Rechaza un pedido pendiente. |
| `GET precios/` | Los tres planes con su precio en pesos y en dólares. |
| `PUT precios/{code}/` | Actualiza los dos precios de un plan. |
| `POST precios/{code}/cambio/` | Programa un precio nuevo en pesos y avisa a los suscriptores. |
| `DELETE precios/{code}/cambio/` | Cancela el cambio de precio pendiente. |
| `GET registro/?page=` | Registro de acciones del backoffice, de la más nueva a la más vieja. |
| `GET pagos/?tipo=pagos\|suscripciones&page=` | Pagos (por defecto) o suscripciones de Mercado Pago, de la más nueva a la más vieja. |

Las listas paginadas devuelven `{count, next, previous, results}` con 50 filas por página.

### Resumen
```json
{
  "accounts": {
    "total": 8, "founders": 2, "trial": 1,
    "active": {"basico": 3, "productor": 1, "empresa": 1}
  },
  "founders_left": 3,
  "pending_requests": 1,
  "new_accounts_last_30_days": 7,
  "payments": {
    "active_subscriptions": 2, "monthly_ars": 64800,
    "month_payments": 2, "month_ars": 64800.0
  }
}
```
El estado de cada cuenta sigue la misma regla que `plans.membership_status`: con número de
founder es `founder`; si no, con vencimiento es `trial`; si no, `active`. `active` se separa
por plan.

`payments` (S7), solo en pesos:
- `active_subscriptions` y `monthly_ars`: suscripciones `authorized` que siguen vigentes y
  lo que facturan por mes (el ingreso mensual recurrente).
- `month_payments` y `month_ars`: pagos `approved` desde el día 1 del mes en hora de Buenos
  Aires, y su total.

**Por qué en hora de Buenos Aires:** un pago del 1 de noviembre a las 2:00 UTC es del 31 de
octubre para el negocio. Los montos son números, como en el resto de la API
(`COERCE_DECIMAL_TO_STRING` es `False`).

### Cuentas
- `q` busca en nombre y email, sin importar mayúsculas.
- `plan` filtra por código (`basico`, `productor`, `empresa`).
- `estado` filtra por `founder`, `trial` o `active`. Otro valor da 400
  `{"detail": "Estado inválido: usá founder, trial o active."}`.
- Cada fila: `id`, `name`, `email`, `plan` (`{code, name}`), `status`, `founder_number`,
  `lotes` (cantidad), `date_joined`, `last_login`, `is_superuser`. Orden: altas más nuevas
  primero.

### Ficha de una cuenta (backoffice-superadmin S1)
`GET cuentas/{id}/` devuelve en una sola respuesta:

- el perfil: `id`, `name`, `email`, `plan` (`{code, name}`), `status`, `founder_number`,
  `plan_expires_at`, `is_active`, `is_superuser`, `date_joined`, `last_login`;
- `plan_changes`: el historial de planes, del más nuevo al más viejo, con `id`, `at`,
  `from_plan` (`null` en el alta), `to_plan`, `reason`, `by` (`{id, name, email}` o `null`) y
  `note`;
- `subscriptions`: las suscripciones de Mercado Pago, con los campos de `pagos/?tipo=suscripciones`
  menos `user`;
- `payments`: los pagos, con los campos de `pagos/` menos `user`;
- `lotes`: `{id, name, created_at}`;
- `alert_rules`: `{id, variable, name, lote, enabled}` (`name` es la variable en palabras,
  `lote` el nombre del lote).
- `courtesy`: la cortesía activa, `{plan: {code, name}, starts_at, ends_at, reason,
  granted_by: {id, name, email} | null}`, o `null` si no tiene.

Nunca devuelve contraseñas, `checkout_url` ni el `payload` de Mercado Pago. Cuenta
inexistente: 404. **Por qué una sola respuesta:** el super admin abre la ficha para decidir
qué hacer con una cuenta, y necesita verlo todo junto; son pocas filas por cuenta.

Todas las escrituras de abajo responden la ficha actualizada, así la pantalla la reemplaza sin
pedirla de nuevo. Una escritura que no cambia nada (bloquear una cuenta ya bloqueada, editar
con los mismos datos) responde 200 y no deja fila en el registro.

### Editar nombre y email
`PATCH cuentas/{id}/` con `{"name": "...", "email": "..."}`, uno o los dos. El email se
normaliza como en el alta (sin espacios y en minúsculas).

- Un email que ya usa otra cuenta, sin importar mayúsculas: 400
  `{"email": ["Ya hay una cuenta con ese email."]}`.
- Un email inválido o un nombre vacío: 400 con el error en ese campo.
- El registro guarda `{before, after}` solo con los campos que cambiaron.

A diferencia de `PATCH /api/auth/me/`, no pide la contraseña actual. **Por qué:** quien edita
es un super admin, no el dueño de la cuenta; el registro deja constancia del cambio.

### Control de acceso (S2)
- `bloquear/` pone `is_active` en `False`. Django rechaza las cuentas inactivas: no pueden
  entrar y una sesión abierta deja de funcionar en el próximo pedido. `desbloquear/` lo
  vuelve a `True`.
- (A) Bloquear no cancela la suscripción de Mercado Pago. **Por qué:** cobrarle o no a una
  cuenta es otra decisión; se cancela aparte desde la misma ficha.
- `superadmin/dar/` y `superadmin/quitar/` cambian `is_superuser` e `is_staff` juntos.
  **Por qué juntos:** un super admin también usa el admin de Django, y quitar uno solo dejaría
  un permiso a medias.
- Un super admin no puede bloquearse ni quitarse el super admin a sí mismo: 400
  `{"detail": "No podés hacer eso con tu propia cuenta."}`. **Por qué:** así nadie se queda
  afuera por error, y siempre queda al menos el super admin que hizo el cambio.
- `restablecer-contrasena/` llama a `apps.accounts.password_reset.send_reset_email`, el mismo
  mail que "Olvidé mi contraseña" (enlace de 1 hora, de un solo uso).
  - Cuenta bloqueada: 400 `{"detail": "La cuenta está bloqueada."}`.
  - (A) Respeta la misma espera de 10 minutos entre mails a una dirección: un segundo pedido
    dentro de ese tiempo da 429
    `{"detail": "Ya le mandamos un mail hace menos de 10 minutos. Probá de nuevo más tarde."}`
    y no se registra. **Por qué:** `send_reset_email` ya tiene ese límite contra el envío
    masivo; saltearlo desde el backoffice abriría otra puerta.

### Plan y founder a mano (S3)
- `prueba/` con `{"hasta": "2026-12-01"}` pone la cuenta en Productor con `plan_expires_at` al
  final de ese día en hora de Buenos Aires (23:59:59). Si ya estaba en prueba, la fecha nueva
  reemplaza la anterior. Pasa por `plans._switch` con motivo `staff` y `by=<super admin>`, bajo
  el mismo lock de la cuenta, y después pone el vencimiento. Al vencer, la tarea de siempre
  (`expire_trials`) la pasa a Básico.
  - Fecha de hoy o pasada: 400 `{"hasta": ["La fecha tiene que ser futura."]}`.
  - Más de 365 días después de hoy: 400 `{"hasta": ["La prueba dura como máximo un año: elegí
    una fecha hasta el 16/11/2027."]}`. **Por qué:** decisión del usuario (cortesias L2), "Un
    solo camino, todo con vencimiento": antes se podía dar Productor hasta 2099.
  - Un super admin (la propia cuenta u otra) o una cuenta bloqueada: los mismos 400 que la
    cortesía (ver "Cortesías").
  - Un founder: 400 `{"detail": "La cuenta es founder: ya tiene Productor sin vencimiento."}`.
  - Una cuenta que paga (suscripción `authorized` o `paused` sin terminar): 400
    `{"detail": "La cuenta tiene una suscripción paga: cancelala primero."}`.
  - Una suscripción cancelada que todavía tiene días pagos: 400 `{"detail": "La cuenta tiene
    días pagos hasta el 06/12/2026: dale la prueba después de esa fecha."}`.
  - **Por qué:** con la suscripción andando, el vencimiento de la prueba haría que
    `expire_trials` pase a Básico una cuenta que sigue pagando. Con una cancelada, el fin de
    sus días pagos (`end_cancelled_subscriptions`) cortaría antes una prueba más larga. Hasta
    que existan los créditos (meses gratis sin cancelar), primero se cancela.
- `founder/dar/` toma el próximo número de `FounderProgram` con `select_for_update`, como el
  alta (`plans.start_membership`), y pone la cuenta en Productor sin vencimiento (motivo
  `staff`). Si ese número ya lo tiene otra cuenta (puesto a mano en el admin), usa el
  siguiente libre.
  - Un super admin (la propia cuenta u otra) o una cuenta bloqueada: los mismos 400 que la
    cortesía (ver "Cortesías").
  - Una cuenta que ya es founder: 400 `{"detail": "La cuenta ya es founder (n.º 3)."}`.
  - Una cuenta que paga: 400 `{"detail": "La cuenta tiene una suscripción paga: cancelala
    primero."}`. **Por qué:** founder es Productor gratis; sin cancelar, Mercado Pago le
    seguiría cobrando. Una suscripción cancelada con días pagos no frena el founder (ese fin
    nunca toca a un founder).
  - (A) Funciona aunque el cupo esté completo. **Por qué:** es una decisión a mano del super
    admin; la pantalla le muestra antes cuántos lugares quedan.
- `founder/quitar/` borra `founder_number`. El número no se vuelve a dar.
  - Una cuenta que no es founder: 400 `{"detail": "La cuenta no es founder."}`.
  - (A) El plan queda como está, sin vencimiento, así que la cuenta queda "activa" en ese
    plan. **Por qué:** quitar el founder y cambiar el plan son dos decisiones; el plan se
    cambia aparte si hace falta.

### Cortesías (cortesias S1-S3)
Una cortesía es un plan pago (Productor o Empresa) gratis hasta una fecha, para unas pocas
cuentas que sirven de enganche. Es el único camino para dar un plan pago sin cobrar, y
siempre vence. La guarda el modelo `accounts.Courtesy` (plan, `starts_at`, `ends_at`, motivo,
quién la dio, `ended_at` y `reminder_sent_at`); como mucho una activa por cuenta (`ended_at`
vacío, restricción única condicional). Mientras está activa, `plan_expires_at` de la cuenta
es su `ends_at`, igual que una prueba. La lógica está en `apps/accounts/plans.py`
(`grant_courtesy`, `revoke_courtesy`, `end_courtesies`, `remind_courtesies`).

- `POST cortesia/` con `{"plan": "empresa", "hasta": "2026-12-31", "motivo": "Cliente de
  enganche"}` pone la cuenta en ese plan hasta el final de `hasta` en hora de Buenos Aires
  (23:59:59). Queda un `PlanChange` con motivo `courtesy`, `by=<super admin>` y el motivo como
  nota, y un `BackofficeAction` `courtesy_grant`. Responde la ficha.
  - `plan` solo `productor` o `empresa`: si no, 400 `{"plan": ["\"basico\" no es una
    elección válida."]}`.
  - `hasta` de hoy o pasada: 400 `{"hasta": ["La fecha tiene que ser futura."]}`. Más de 365
    días después de hoy: 400 `{"hasta": ["La cortesía dura como máximo un año: elegí una
    fecha hasta el 16/11/2027."]}`.
  - `motivo` obligatorio, no en blanco, hasta 200 caracteres (errores de campo).
  - La propia cuenta del super admin: 400 `{"detail": "No podés darte una cortesía a vos
    mismo."}`.
  - Otro super admin: 400 `{"detail": "La cuenta es super admin: no recibe cortesías, pruebas
    ni founder."}`. Una cuenta bloqueada: 400 `{"detail": "La cuenta está bloqueada."}`. Lo
    mismo vale para `prueba/` y `founder/dar/` (`refuse_if_not_grantable`). **Por qué:** dos
    super admins podían regalarse planes entre ellos, y un plan gratis solo sirve a una cuenta
    de cliente que funciona (hallazgos del verificador, cortesias L5).
  - Un founder que pide Productor: 400 `{"detail": "La cuenta es founder: ya tiene Productor
    sin vencimiento."}`. Empresa sí se le puede dar: la cortesía es la excepción explícita del
    super admin y no pasa por `refuse_free_empresa`.
  - Una cuenta que paga o con días pagos de una cancelada: los mismos 400 que `prueba/`
    (`refuse_if_paying(..., trial=True)`).
  - Con 20 cortesías activas: 400 `{"detail": "Ya hay 20 cortesías activas. Revocá alguna
    antes de dar otra."}`. Cada alta nueva toma primero un mismo lock de Postgres
    (`pg_advisory_xact_lock`, hasta el commit) y después cuenta en una consulta nueva, así ve
    la cortesía que otra alta acaba de guardar y dos altas a la vez no pasan las dos el tope.
    (reemplazado el 2026-11-20: antes se bloqueaban las filas activas, y el conteo no veía la
    fila que la otra alta había guardado mientras esperaba.)
- Darla otra vez a una cuenta con una activa cambia el plan, la fecha y el motivo de esa
  misma cortesía (no cuenta para el tope). Si solo cambia la fecha, no hay `PlanChange` nuevo.
- **1 año en 2 años** (cortesias L5): en cualquier ventana de 730 días una cuenta suma como
  máximo 365 días de cortesía. Cuentan todas: una revocada hasta su revocación, una vencida
  hasta su fin (no hasta que corrió la tarea) y la activa hasta el `hasta` pedido. Los días se
  cuentan en hora de Buenos Aires, de la fecha de inicio a la de fin. Al darla o cambiarla:
  - si una fecha más corta entra: 400 `{"detail": "Una cuenta suma como máximo un año de
    cortesía cada 2 años: esta puede terminar como máximo el 19/05/2027."}`;
  - si no entra ni un día: 400 `{"detail": "Una cuenta suma como máximo un año de cortesía
    cada 2 años: puede recibir otra desde el 01/06/2027."}`.
  **Por qué:** decisión del usuario, "1 año en 2 años (Recomendado)". Antes el año se contaba
  desde el primer otorgamiento de la cortesía activa, y revocarla y darla de nuevo empezaba
  otro año completo. (reemplazado el 2026-11-20.)
- `DELETE cortesia/` la termina ya: la cuenta pasa a Básico, o a Productor si es founder.
  `PlanChange` con motivo `courtesy_ended` y `by=<super admin>`, `BackofficeAction`
  `courtesy_revoke`. Sin cortesía activa: 404 `{"detail": "La cuenta no tiene una cortesía
  activa."}`. No manda email.
- La tarea diaria `accounts.expire_trials` también termina las cortesías vencidas (mismo
  destino, motivo `courtesy_ended`, sin `by`) y le manda a la cuenta "Terminó tu cortesía del
  plan <Plan>" con el enlace a `/planes`. Unos 7 días antes del final manda una sola vez "Tu
  cortesía del plan <Plan> termina el <fecha>" invitando a suscribirse.
- Cualquier otro cambio de plan termina la cortesía activa: lo hace `plans._switch` para todo
  motivo que no sea `courtesy`. Así, si la cuenta se suscribe y Mercado Pago autoriza el pago,
  el plan lo pone el pago (`payment`) una sola vez y la cortesía queda terminada; lo mismo
  bajarla a Básico, darle la prueba o el founder.
- **Seguridad:** todo se valida en el servidor, solo para super admins, y cada alta, cambio y
  revocación queda en el registro, que nadie edita. En el admin de Django el plan y su
  vencimiento son de solo lectura: un plan solo cambia desde el backoffice, donde queda
  registrado. Pendiente: verificación en dos pasos para super admins.

### Mercado Pago desde el panel (S4)
- `suscripcion/sincronizar/` toma la suscripción más nueva de la cuenta y le pide a Mercado
  Pago su estado (`GET /preapproval/{id}`) y sus cobros
  (`GET /authorized_payments/search?preapproval_id={id}`, y `GET /v1/payments/{id}` de cada
  cobro que ya tiene pago). Primero lee todo; después aplica la respuesta con
  `payments.services.sync_subscription` y `record_payment`, las mismas funciones del webhook,
  en la misma transacción que el registro. **Por qué:** sirve cuando se perdió un webhook, y
  si Mercado Pago falla a mitad de camino no queda nada aplicado a medias. El payload de cada
  pago se filtra igual que en el webhook (`PAYLOAD_KEYS`).
- `suscripcion/cancelar/` llama a `payments.services.cancel(user)`, el mismo botón "Darme de
  baja" del usuario: cancela en Mercado Pago y la cuenta conserva el plan hasta el fin del mes
  pago.
- Errores de los dos:
  - Sin suscripción (para cancelar: sin una activa o pausada vigente): 404
    `{"detail": "La cuenta no tiene una suscripción con Mercado Pago."}`.
  - Mercado Pago falla o no responde: 502
    `{"detail": "No pudimos conectar con Mercado Pago. Probá de nuevo en un rato."}`.
  - Pagos sin configurar: 503 `{"detail": "Los pagos todavía no están habilitados."}`, sin
    llamar a Mercado Pago.
- La búsqueda de cobros trae la primera página que devuelve Mercado Pago, que alcanza para
  muchos meses de una suscripción mensual.

### Cambiar el plan
Cuerpo `{"plan": "basico", "note": "opcional, hasta 200 caracteres"}`. Solo baja la cuenta a
su plan gratis: Básico, o Productor para un founder (cortesias S4). Pasa por
`plans.change_plan(..., reason="staff", by=<super admin>, note=...)`, el mismo camino que el
admin de Django, así que queda en el historial de planes (`PlanChange`) y termina una prueba o
una cortesía activa. Devuelve la fila de la cuenta.

- Otro plan: 400 `{"detail": "Para dar un plan pago sin cobrar, usá una cortesía."}`. Para un
  founder que pide Empresa sigue respondiendo "Como founder, Empresa se paga con Mercado Pago:
  pagás solo la diferencia.".
  **Por qué:** decisión del usuario (cortesias L2): "Subir a un plan pago sin cobrar se hace
  solo como cortesía, con fecha ≤ 1 año, motivo y tope." Antes este endpoint regalaba
  cualquier plan sin vencimiento, sin tope y sin mirar si la cuenta pagaba.
  (A) Productor para un founder se acepta porque es su plan gratis, no un plan pago regalado.
- Las cuentas que ya estaban en un plan pago sin vencimiento quedan como están (no se cambió
  ningún dato guardado). Para encontrarlas, ver "Cuentas con plan pago sin cobrar" en
  [planes.md](planes.md).
- Plan inexistente: 400 `{"detail": "Ese plan no existe."}`.
- La cuenta ya está en ese plan (y no está en prueba): 400
  `{"detail": "La cuenta ya está en el plan Básico."}`. No se registra nada.
- Cuenta inexistente: 404.

### Pedidos
Cada fila: `id`, `kind` (`change` o `cancel`), `plan` (`{code, name}`), `status`,
`created_at` y `user` (`{id, name, email, plan, status}`).

`aplicar` y `rechazar` llaman a `plans.apply_request` y `plans.reject_request`, las mismas
funciones que usan las acciones "Aplicar/Rechazar pedidos seleccionados" del admin.
**Por qué:** así el admin y el backoffice no pueden comportarse distinto. Aplicar cambia el
plan con motivo `request`, marca el pedido como `applied` y manda el email "Tu plan ahora es
…" después del commit. Rechazar lo marca como `rejected` y no toca el plan ni manda email.
`rechazar` acepta `{"note": "..."}` opcional; la nota queda solo en el registro, porque el
pedido no tiene campo de nota.

- Pedido que ya no está pendiente (retirado o resuelto por otro): 409
  `{"detail": "El pedido ya no está pendiente."}`.
- Pedido inexistente: 404.
- Responde la fila del pedido con su nuevo `status`.

### Precios
`PUT` exige los dos campos: `{"price_ars_month": 16500, "price_usd_month": 15}`. Cada uno
es un entero mayor o igual a 0, o `null`. `null` significa "Precio a confirmar" y `0`
significa gratis. Un valor negativo, decimal, texto o booleano da 400 con el error en ese
campo. Plan inexistente: 404. Es la actualización trimestral de precios; ver
[planes.md](planes.md).

El `PUT` cambia el precio en el momento, pero solo lo pagan los checkouts nuevos. Para que lo
paguen también las suscripciones que ya cobran, hay que programar un cambio (avisos-cambios).
Cada plan trae `pending_change`: `null` o `{price_ars_month, effective_on, notices,
notices_sent}`, que dice a cuántas suscripciones llega el cambio y cuántos avisos ya salieron.

`POST precios/{code}/cambio/` recibe `{"price_ars_month": 16900, "effective_on": "2026-12-20"}`
y responde 201 con el plan:
- La fecha tiene que caer al menos 30 días después de hoy: "La fecha tiene que ser al menos 30
  días después de hoy." Los términos prometen ese aviso, también cuando el precio baja.
- El precio es un entero mayor o igual a 1. Plan Básico: 400. Si el plan ya tiene un cambio
  pendiente: 409 ("Cancelalo antes de programar otro").
- Les manda un email a todas las suscripciones `authorized` o `paused` cuyo monto cambia. El
  monto se calcula con `price_for`, así que un cambio en Productor también les llega a los
  founders en Empresa, que pagan la diferencia.

`DELETE precios/{code}/cambio/` cancela el cambio pendiente y no manda email; sin cambio
pendiente responde 404. El detalle de los avisos y de cuándo cambia cada monto está en
[pagos.md](pagos.md#cambios-de-precio-programados).

### Registro
Cada fila: `id`, `action`, `actor` (`{id, name, email}` o `null`), `target_user` (igual, o
`null`), `payload` y `at`.

### Pagos
- `tipo=pagos` (por defecto): `id`, `user` (`{id, name, email}`), `provider`, `external_id`,
  `subscription` (id o `null`), `amount`, `currency`, `status`, `paid_at`, `created_at`.
- `tipo=suscripciones`: `id`, `user`, `plan` (`{code, name}`), `provider`, `external_id`,
  `currency`, `amount`, `status`, `next_payment_at`, `ends_at` (hasta cuándo conserva el plan
  una cancelada), `ended_at`, `created_at`.
- Otro `tipo`: 400 `{"detail": "Tipo inválido: usá pagos o suscripciones."}`.

No se devuelven `payload` (la respuesta cruda de Mercado Pago) ni `checkout_url`.
**Por qué:** el backoffice no los necesita, y el payload puede traer datos del pago que no
hace falta mostrar. `external_id` sirve para buscar el pago en el panel de Mercado Pago.

## Por qué se registra cada escritura
Cada escritura guarda un `BackofficeAction` (quién, qué acción, sobre qué cuenta, con qué
datos y cuándo) en la misma transacción que el cambio: se guardan los dos o ninguno.
**Por qué:** varios super admins pueden cambiar planes y precios de cualquier cuenta, y un
cambio de precio afecta a todos los usuarios. El registro permite saber después quién hizo
cada cambio y deshacerlo con los valores anteriores. En el admin de Django es de solo
lectura.

| `action` | Cuándo | `payload` |
|---|---|---|
| `plan_change` | cambio de plan | `{from, to, note}` |
| `request_apply` | pedido aplicado | `{request, kind, plan}` |
| `request_reject` | pedido rechazado | `{request, kind, plan, note}` |
| `price_update` | precio actualizado | `{plan, before, after}` con los dos precios |
| `price_schedule` / `price_unschedule` | cambio de precio programado o cancelado | `{plan, price_ars_month, effective_on}` |
| `account_update` | nombre o email editados | `{before, after}`, solo los campos que cambiaron |
| `account_block` / `account_unblock` | cuenta bloqueada o desbloqueada | `{}` |
| `superadmin_grant` / `superadmin_revoke` | super admin dado o quitado | `{}` |
| `password_reset` | mail para restablecer la contraseña | `{}` |
| `trial_grant` | prueba dada o extendida | `{until, from_plan}` (`until` es `YYYY-MM-DD`) |
| `founder_grant` | founder dado | `{number, from_plan}` |
| `founder_revoke` | founder quitado | `{number}` |
| `courtesy_grant` | cortesía dada o cambiada | `{plan, until, reason, from_plan}` (`until` es `YYYY-MM-DD`) |
| `courtesy_revoke` | cortesía revocada | `{plan, until, to_plan}` |
| `subscription_sync` | suscripción sincronizada | `{subscription, before, after, payments}`: el id en Mercado Pago, el estado antes y después, y cuántos pagos se registraron |
| `subscription_cancel` | suscripción cancelada | `{subscription, before, after}` |
| `export` | exportación CSV (S8, ver [backoffice-informes.md](backoffice-informes.md)) | `{file, rows}` |

Las acciones hechas desde el admin de Django no entran en este registro: el admin ya guarda
su propio historial y el `PlanChange` registra quién movió el plan.

## Pantalla `/backoffice` (frontend)
`frontend/src/pages/Backoffice.tsx`, las pestañas en `frontend/src/pages/backoffice/` y la
API en `frontend/src/api/backoffice.ts`. Se entra desde Perfil, por la sección
"Backoffice" que solo ve un super admin.

- Sin `me.is_superuser` redirige a `/perfil` sin llamar a la API (la SPA trata un 403 que
  no es de CSRF como sesión perdida). Si igual llega un 403, se vuelve a pedir `me` y se
  sale sin cerrar la sesión.
- Pestañas: Resumen, Cuentas (búsqueda, plan y estado; "Cambiar plan" con nota; el nombre
  abre la ficha),
  Pedidos (Aplicar; Rechazar con nota), Pagos (pagos o suscripciones), Precios (los dos
  precios de cada plan; vacío es `null`; debajo, "Cambio para los suscriptores": programar un
  precio en pesos con fecha, en un diálogo que avisa que el email sale en el momento, o ver el
  pendiente con cuántos avisos salieron y cancelarlo con confirmación; Básico no lo tiene) y
  Registro. La pestaña abierta queda en
  `?seccion=`.
- Las escrituras usan `apiFetch`, que manda el CSRF. Después de cada una se vuelven a
  pedir todas las listas y el resumen.
- El Registro describe cada acción en palabras, también las nuevas (por ejemplo "Prueba de
  Productor hasta el 1 de diciembre de 2026 (venía de Básico)", o "Cortesía de Empresa hasta
  el 31 de marzo de 2027 (venía de Básico). Motivo: «Cooperativa piloto»" y "Cortesía de
  Empresa revocada (era hasta el 31 de marzo de 2027): pasó a Básico").

### Ficha de cuenta
`frontend/src/pages/backoffice/cuenta/`. El nombre de cada cuenta en la pestaña Cuentas es un
enlace a `?seccion=cuentas&cuenta=<id>`, que muestra la ficha en lugar de la lista; "Todas las
cuentas" vuelve. **Por qué en la dirección:** recargar o compartir el enlace abre la misma
ficha, y el botón Atrás del navegador vuelve a la lista.

- Secciones: Datos (plan, estado, acceso, alta, último ingreso; "Editar nombre y email"),
  Acceso (bloquear o desbloquear, dar o quitar super admin, mandar el mail de la contraseña),
  Plan y founder (la cortesía activa, "Cambiar plan", "Dar cortesía" o "Cambiar cortesía" y
  "Revocar cortesía", "Dar o extender prueba", "Marcar founder" o "Quitar founder", e
  historial de planes), Mercado Pago ("Sincronizar con Mercado Pago", "Cancelar
  suscripción", suscripciones y pagos) y Lotes y alertas.
- Cada acción abre un diálogo nativo (`BackofficeDialog`) que explica qué va a pasar antes de
  mandar nada. En las confirmaciones el foco arranca en la salida segura ("Cancelar" o
  "Volver"): el diálogo enfoca el control marcado con `data-autofocus` al abrirse, porque React
  no escribe el atributo `autofocus` que busca `showModal()`. Un rechazo de la API queda en el
  diálogo con sus palabras; los errores de un campo (email en uso, fecha pasada) quedan junto
  al campo.
- La prueba se elige con un `<input type="date">` cuyo mínimo es mañana en Buenos Aires; la
  fecha viaja como texto `YYYY-MM-DD`, sin pasar por `Date`, así no se corre un día.
- Cortesías (cortesias S5): con una activa, la sección muestra plan, hasta cuándo, motivo y
  quién la dio, y el estado de Datos dice "Cortesía de <Plan> hasta el <fecha>". "Dar
  cortesía" abre un diálogo con plan (Productor o Empresa; a un founder solo Empresa), fecha
  (`min` mañana y `max` un año, `lastCourtesyDay` en `pages/backoffice/format.ts`) y motivo;
  sin fecha o con el motivo en blanco avisa junto al campo y no manda nada. Con una activa el
  botón dice "Cambiar cortesía" y el diálogo arranca con sus datos. "Revocar cortesía" pide
  confirmación con el foco en "Cancelar" y manda `DELETE cortesia/`.
  **Por qué el `max` y los avisos si el servidor ya valida:** evitan un viaje que se sabe
  rechazado; las reglas (tope, paga, founder, el año) siguen solo en el servidor (S6) y su
  rechazo se ve en el diálogo.
- "Cambiar plan" ofrece solo Básico, y además Productor a un founder, con la nota "Para dar
  un plan pago sin cobrar, usá una cortesía." (cortesias S4).
- El diálogo de "Marcar founder" muestra cuántos lugares quedan (`founders_left` del
  resumen) y avisa si el cupo está completo, sin impedirlo.
- En la ficha propia no aparecen "Bloquear cuenta" ni "Quitar super admin", y una nota lo
  explica; la API igual lo rechaza.
- La respuesta de cada escritura reemplaza la ficha en la caché, y además se vuelven a pedir
  la lista y el resumen.
- Es modo Operate de "Cielo vivo" y usa todo el ancho de la columna. En el teléfono, las
  tablas pasan a bloques con etiquetas.

## Pendiente
- Nada del lado del backend.

## Historial
- 2026-11-17: versión inicial (S4).
- 2026-11-19: pagos y suscripciones (`pagos/`) e ingresos en pesos en `resumen/` (S7).
- 2026-11-19: pantalla `/backoffice` en el frontend (T4).
- 2026-11-19: Pedidos vuelve a la página anterior al resolver el último pedido de una página (el review vio que quedaba en error con 404 "Página inválida.").
- 2026-11-19: ficha de cuenta con edición, control de acceso, prueba y founder a mano, y sincronizar o cancelar la suscripción de Mercado Pago (backoffice-superadmin S1-S4).
- 2026-11-19: prueba y founder se rechazan para una cuenta que paga (advertencia del verificador).
- 2026-11-20: cortesías (`cortesia/`, dar, cambiar y revocar) y el cambio de plan solo baja al plan gratis (cortesias S1-S4, S6).
- 2026-11-20: la ficha muestra, da, cambia y revoca cortesías; "Cambiar plan" solo ofrece el plan gratis; el registro describe `courtesy_grant` y `courtesy_revoke`, y el historial de planes del usuario dice "Empezó tu cortesía" y "Terminó tu cortesía" (cortesias S5).
- 2026-11-20: correcciones del verificador (cortesias T3): el tope de 20 aguanta altas simultáneas, "1 año en 2 años" por cuenta, ni cortesía ni prueba ni founder a un super admin o a una cuenta bloqueada, prueba de como máximo un año, y plan y vencimiento de solo lectura en el admin de Django.
