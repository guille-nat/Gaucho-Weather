# Backoffice
> Última actualización: 2026-11-17

## Qué hace
Una API para que los super admins administren cuentas, pedidos de plan y precios sin entrar
al admin de Django. La usa la pantalla `/backoffice` del frontend. Vive en
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
| `GET resumen/` | Totales de cuentas, cupos de founder libres, pedidos pendientes y altas de los últimos 30 días. |
| `GET cuentas/?q=&plan=&estado=&page=` | Lista paginada de cuentas. |
| `POST cuentas/{id}/plan/` | Cambia el plan de una cuenta. |
| `GET pedidos/?page=` | Pedidos de plan pendientes, del más viejo al más nuevo. |
| `POST pedidos/{id}/aplicar/` | Aplica un pedido pendiente. |
| `POST pedidos/{id}/rechazar/` | Rechaza un pedido pendiente. |
| `GET precios/` | Los tres planes con su precio en pesos y en dólares. |
| `PUT precios/{code}/` | Actualiza los dos precios de un plan. |
| `GET registro/?page=` | Registro de acciones del backoffice, de la más nueva a la más vieja. |

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
  "new_accounts_last_30_days": 7
}
```
El estado de cada cuenta sigue la misma regla que `plans.membership_status`: con número de
founder es `founder`; si no, con vencimiento es `trial`; si no, `active`. `active` se separa
por plan.

### Cuentas
- `q` busca en nombre y email, sin importar mayúsculas.
- `plan` filtra por código (`basico`, `productor`, `empresa`).
- `estado` filtra por `founder`, `trial` o `active`. Otro valor da 400
  `{"detail": "Estado inválido: usá founder, trial o active."}`.
- Cada fila: `id`, `name`, `email`, `plan` (`{code, name}`), `status`, `founder_number`,
  `lotes` (cantidad), `date_joined`, `last_login`, `is_superuser`. Orden: altas más nuevas
  primero.

### Cambiar el plan
Cuerpo `{"plan": "empresa", "note": "opcional, hasta 200 caracteres"}`. Pasa por
`plans.change_plan(..., reason="staff", by=<super admin>, note=...)`, el mismo camino que el
admin de Django, así que queda en el historial de planes (`PlanChange`) y termina una prueba.
Devuelve la fila de la cuenta.

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

### Registro
Cada fila: `id`, `action`, `actor` (`{id, name, email}` o `null`), `target_user` (igual, o
`null`), `payload` y `at`.

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

Las acciones hechas desde el admin de Django no entran en este registro: el admin ya guarda
su propio historial y el `PlanChange` registra quién movió el plan.

## Pendiente
- Pagos e ingresos del mes en el backoffice (S7, `apps.payments`).
