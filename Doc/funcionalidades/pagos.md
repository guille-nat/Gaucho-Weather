# Pagos con Mercado Pago
> Última actualización: 2026-11-20

## Qué hace
Un productor se suscribe a un plan pago (Agrónomo o Productor) y Mercado Pago le cobra
todos los meses en pesos. El plan de la cuenta cambia solo cuando Mercado Pago avisa que la
suscripción quedó autorizada. Pagar en dólares todavía no existe. Vive en
`backend/apps/payments` y responde bajo `/api/pagos/`.

## Cómo funciona

### Flujo
1. La SPA muestra el resumen "Antes de ir a Mercado Pago" y, con la casilla de los términos,
   llama `POST /api/pagos/suscribirme/` con `{plan, currency: "ARS", acepta_terminos: true}`
   (ver [terminos.md](terminos.md)).
2. El backend crea una suscripción en Mercado Pago (`POST /preapproval`, mensual, en ARS).
   Guarda una `ProviderSubscription` en `pending` y devuelve `{checkout_url}`.
3. El productor paga en Mercado Pago y vuelve a `PUBLIC_APP_URL/perfil/suscripcion?pago=ok`.
4. Mercado Pago llama al webhook. El backend verifica la firma, **pide el recurso a la API**
   (no confía en el cuerpo) y aplica la regla:
   - suscripción `authorized`: `change_plan(..., reason="payment")`, que termina la prueba. Si
     venía de `pending`, manda una sola vez el email de confirmación (`confirmation_sent_at`);
   - suscripción `cancelled` o `paused`: la cuenta conserva el plan hasta `next_payment_at` y
     después pasa a Básico con `payment_ended` (un founder vuelve a Productor). Si nunca se pagó
     (venía de `pending`), se cierra sin tocar el plan;
   - pagos (`payment` y `subscription_authorized_payment`): se crea o actualiza el `Payment`
     por su id de Mercado Pago. Un pago rechazado no baja el plan.
5. La tarea `payments.end_cancelled_subscriptions` corre cada hora (minuto 30) y pasa a
   Básico (o a Productor, si es founder) las suscripciones canceladas o pausadas cuyo mes pago
   ya terminó.

### Founder que sube a Empresa (promociones SF1–SF5)
- El monto lo calcula un solo lugar, `services.price_for(user, plan)`: el precio del plan, o
  para un founder `Empresa − Productor` (`founder_empresa_price()`, $35.000 hoy). Lo usan el
  preapproval, `ProviderSubscription.amount` y el reuso del checkout pendiente.
- Un founder solo puede suscribirse a Empresa. Productor sigue rechazado con "Como founder ya
  tenés Productor gratis para siempre."; si la diferencia no es positiva o falta un precio,
  409 "Ese plan todavía no tiene precio en pesos.".
- Al autorizarse pasa a Empresa (`payment`) y conserva `founder_number`. Al terminar el mes
  pago de una baja o pausa, `_end` lo vuelve a Productor (`payment_ended`), nunca a Básico.
- `GET /api/planes/` suma `founder_empresa_price_ars` (o `null`), el mismo para todos los
  founders: la tabla sigue siendo pública y la SPA no tiene el monto escrito.

### Endpoints
| Método y ruta | Qué hace |
|---|---|
| `GET /api/pagos/` | `payments_enabled`, la suscripción actual (o `null`) y los últimos 50 pagos. |
| `POST /api/pagos/suscribirme/` | 201 `{checkout_url}`; guarda la aceptación `subscribe` de los términos. |
| `POST /api/pagos/cancelar/` | Cancela en Mercado Pago; devuelve lo mismo que `GET /api/pagos/`. |
| `POST /api/pagos/mercadopago/webhook/` | Público, sin CSRF; la firma es la autenticación. |

`GET /api/planes/` suma `payments_enabled` y `founder_empresa_price_ars`.

Rechazos de `suscribirme/` (todos con `detail` en español):

| Caso | Código |
|---|---|
| Sin `acepta_terminos: true`: `{"acepta_terminos": ["Tenés que aceptar los términos y la política de privacidad."]}`, antes que cualquier otro rechazo | 400 |
| Plan inexistente, Básico, founder a un plan que no es Empresa, ya suscripto, o ya está en ese plan sin prueba | 400 |
| `currency: "USD"`: "Pagar en dólares todavía no está disponible." | 409 |
| El plan no tiene precio en pesos | 409 |
| Mercado Pago no configurado: "Los pagos todavía no están habilitados." | 503 |
| Mercado Pago no responde | 502 |

`cancelar/` sin suscripción activa responde 404.

Borrar la cuenta (`DELETE /api/auth/me/`) cancela antes en Mercado Pago toda suscripción que
todavía pueda cobrar (`pending`, `authorized` o `paused`). Si Mercado Pago no responde, 502 con
el mismo mensaje y la cuenta no se borra: así nada sigue cobrándole a una cuenta que ya no existe.
Si Mercado Pago rechaza la cancelación, se consulta la suscripción: si allá ya figura cancelada
(un webhook perdido), cuenta como hecha y la cuenta se borra igual. Las cuentas sin suscripción de Mercado Pago
siguen usando el pedido de baja de siempre (`/api/auth/suscripcion/`), sin cambios.

### Webhook
- Firma inválida o ausente: 401, aunque el cuerpo venga malformado (el cuerpo se lee antes de
  verificar la firma, así que nunca se asume su forma). Sin credenciales configuradas: 503.
- Si la API de Mercado Pago falla, responde 502 para que Mercado Pago reintente.
- Es idempotente: la suscripción se busca por su `external_id` con `select_for_update`, y el
  pago se guarda con `update_or_create` sobre su id único.
- Una notificación de una suscripción o un pago desconocido se ignora con 200.

### Cambios de precio programados
Los términos dicen: "Un cambio de precio se avisa por email con al menos 30 días de
anticipación y rige desde el cobro siguiente a ese plazo". Por eso se hace así
(`apps/payments/price_changes.py`, feature `avisos-cambios`):
- Desde el backoffice se programa un `PriceChange` con el precio nuevo en pesos y en dólares,
  al menos 30 días antes de su fecha. Los avisos y los montos de Mercado Pago solo usan el de
  pesos: todas las suscripciones se cobran en pesos.
- Al programarlo se crea un `PriceNotice` por cada suscripción `authorized` o `paused` cuyo
  monto cambia, y los emails salen en una tarea apenas se confirma la transacción.
- El monto nuevo sale del cambio programado, nunca del precio de hoy: el `PUT precios/` inmediato
  solo cambia lo que pagan los checkouts nuevos. Un suscriptor del plan pasa al precio del cambio.
  Un founder en Empresa paga Empresa menos Productor, cada uno según su último cambio programado,
  así que un cambio en Productor le llega solo a los founders de Empresa y no al resto.
- El aviso es por suscripción: su monto cambia 30 días después de que salió su email, y nunca
  antes de la fecha del cambio. Así, quien se suscribe al precio viejo mientras el cambio está
  pendiente también recibe sus 30 días de aviso.
- La tarea diaria `payments.price_notices` (08:00) crea los avisos de esos suscriptores nuevos y
  reintenta los emails que fallaron. Un aviso sale una sola vez (`sent_at`, con
  `select_for_update`). Mientras su email no salió, la suscripción sigue con el monto viejo.
- Un cambio cancelado no manda nada más y nunca se aplica.
- La tarea diaria `payments.apply_price_changes` (07:00) aplica lo que venció:
  - Desde la fecha del cambio, los dos precios del plan (pesos y dólares) pasan a ser los
    nuevos, así que los checkouts nuevos ya los pagan.
  - Cada suscripción avisada cambia de monto en su fecha: primero en Mercado Pago
    (`PUT /preapproval/{id}` con `auto_recurring.transaction_amount`) y después en `amount`.
    Solo cuenta una respuesta que trae el monto nuevo, porque Mercado Pago a veces responde 200
    e ignora el campo.
  - Si Mercado Pago lo rechaza, se reintenta al día siguiente y las demás siguen.
  - Una suscripción cancelada mientras tanto no se toca, y un cambio viejo nunca pisa a uno más
    nuevo que ya se aplicó.

### Archivos
- `providers/base.py`: la interfaz `PaymentProvider` (iniciar, cancelar, consultar
  suscripción, pago y cobro, y verificar el webhook).
- `providers/mercadopago.py`: la implementación con httpx contra la API REST.
- `providers/__init__.py`: qué proveedor atiende cada moneda (`PROVIDERS_BY_CURRENCY`).
- `services.py`: las reglas del plan. `views.py`, `serializers.py`, `tasks.py`, `admin.py`.
- Modelos: `ProviderSubscription` y `Payment` (migración `0001_initial`);
  `PlanChange.Reason` suma `payment` y `payment_ended` (`accounts` 0009).

### Variables de entorno
`MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_WEBHOOK_SECRET` (secretos) y
`MERCADOPAGO_API_URL` (por defecto `https://api.mercadopago.com`). Con las dos primeras
vacías los pagos están apagados: `payments_enabled` es `false` y suscribirse responde 503.

### En la app (frontend)
`frontend/src/pages/Suscripcion.tsx`, API en `frontend/src/api/payments.ts`:
- Con `payments_enabled` y pesos elegidos, cada plan pago dice "Suscribirme". El botón
  hace `POST suscribirme/` con `{plan, currency: "ARS"}` y lleva al `checkout_url` con
  `window.location.assign`. Un rechazo muestra el `detail` tal cual.
- Con dólares elegidos dice "Pagar en dólares: próximamente" (deshabilitado).
- Un founder ve "Suscribirme" solo en Empresa, con "Como founder pagás solo la diferencia:
  $35.000 por mes." (el monto viene de `founder_empresa_price_ars`). Nunca en Productor ni en
  Básico. Si ya paga Empresa, Productor dice "Es el plan al que volvés gratis si te das de
  baja." y la baja avisa que después pasa a Productor. En Planes pasa lo mismo.
- En prueba, el plan que prueba también ofrece "Suscribirme" en vez de "Quedarme con".
- Con los pagos apagados todo sigue como antes: "Pedir este plan" y el aviso de que el
  equipo aplica el pedido a mano, en las dos monedas.
- `?pago=ok|pendiente|error` (la vuelta de Mercado Pago) muestra un aviso arriba.
- "Darme de baja" usa `POST cancelar/` si hay una suscripción `authorized` o `paused`, y
  avisa hasta cuándo sigue el plan. Sin suscripción usa el pedido de baja de siempre. Una
  suscripción ya cancelada no muestra el botón: el plan termina solo.
- "Tus pagos" muestra la suscripción (estado, monto por mes, próximo cobro o fin) y los
  pagos con fecha, monto y estado.

## Probar en el sandbox
Probado de punta a punta en local el 2026-11-19 (alta, pago aprobado, plan cambiado, pago
registrado).

1. En el panel (https://www.mercadopago.com.ar/developers/panel/app) creá una aplicación con la
   solución **Suscripciones**. En "Cuentas de prueba" tenés (o creás) un vendedor y un
   comprador de Argentina.
2. Copiá el access token de la app en `MERCADOPAGO_ACCESS_TOKEN`. Aunque sea de prueba empieza
   con `APP_USR-`; `GET /users/me` con ese token tiene que traer el tag `test_user`.
3. `.env` local: `PUBLIC_APP_URL=http://127.0.0.1:5173` y abrí la app en esa dirección.
   Mercado Pago rechaza un `back_url` con `localhost` ("Invalid value for back_url").
4. `docker compose up -d backend worker` (con `restart` no se relee el `.env`).
5. El usuario local que se suscribe tiene que tener el email del comprador de prueba:
   `test_user_<números del nickname TESTUSER...>@testuser.com` (no es el User ID; el panel no
   lo muestra). Con un email real, Mercado Pago responde "Both payer and collector must be
   real or test users". `POST /users/test_user {"site_id": "MLA"}` crea un comprador nuevo y
   devuelve su email.
6. En el checkout, entrá con el comprador de prueba y pagá con una tarjeta de prueba
   (titular `APRO`, DNI 12345678 para un pago aprobado).
7. Webhook: con URL pública, cargala en "Webhooks > Configurar notificaciones" con los
   eventos "Planes y suscripciones" y "Pagos" y copiá la clave secreta en
   `MERCADOPAGO_WEBHOOK_SECRET`. Sin túnel, usá cualquier secreto y mandá vos la notificación
   firmada al backend: `POST /api/pagos/mercadopago/webhook/?type=subscription_preapproval&data.id=<preapproval>`
   con `x-request-id` y `x-signature: ts=<ts>,v1=<HMAC-SHA256 de "id:<data.id>;request-id:<x-request-id>;ts:<ts>;">`.
   Para el cobro, lo mismo con `type=subscription_authorized_payment` y el id que devuelve
   `GET /authorized_payments/search?preapproval_id=<preapproval>`.
8. En el admin (`/api/admin/`, sección `Payments`) o en el backoffice tienen que aparecer la
   suscripción `authorized` y el pago, y la cuenta en el plan elegido.

En producción se usan las credenciales `APP_USR-...` de la cuenta real; la URL de la API es
la misma.

## Qué permite Mercado Pago sobre una suscripción existente (probado en el sandbox)
Probado el 2026-11-19 con `PUT /preapproval/{id}` sobre una suscripción `authorized` con un
cobro hecho (próximo cobro el 19/12):
- **Pausar (`paused`) y reanudar (`authorized`) dentro del mismo ciclo:** no cobra nada y no
  mueve `next_payment_date`.
- **Mover el próximo cobro:** `next_payment_date` y `auto_recurring.start_date` responden 200
  pero **se ignoran** (la fecha no cambia). Un 200 no prueba el cambio: hay que releer.
- **Cambiar el monto** (`auto_recurring.transaction_amount`): funciona y vale para los cobros
  siguientes. `0` da 400 "must be a positive number" y el mínimo es $15 ("Cannot pay an amount
  lower than $ 15.00").
- **Sin probar todavía:** qué pasa al reanudar una suscripción que estuvo pausada durante la
  fecha de cobro (si cobra al reanudar, cobra lo atrasado o espera al ciclo siguiente). La
  documentación no lo dice.

## Decisiones y por qué
- **Decisión:** en la app, el aviso "próximamente" en dólares aparece solo con los pagos
  encendidos.
  **Por qué:** con los pagos apagados no se cobra online en ninguna moneda; el pedido al
  equipo cubre las dos. (Interpretación de S5/S6 sin confirmar con el usuario.)
- **Decisión:** solo pesos con Mercado Pago; dólares quedan "próximamente".
  **Por qué:** la documentación oficial solo muestra `currency_id: "ARS"` para
  `auto_recurring`, y Mercado Pago no convierte: mandar 10 por "USD 10" cobra $10.
  El usuario eligió "Otra pasarela para USD" y después "Decidir más adelante".
  **Alternativas descartadas:** cobrar en dólares por Mercado Pago (no es posible);
  PayPal o Stripe con empresa en EE. UU. (pendiente de decisión).
- **Decisión:** una interfaz de proveedor elegida por moneda.
  **Por qué:** permite sumar la pasarela de dólares sin tocar las reglas de `services.py`.
- **Decisión:** suscripción sin plan asociado (`POST /preapproval` con `pending`).
  **Por qué:** el monto sale del precio del plan en la base, que se actualiza cada
  trimestre desde el backoffice; no hay que mantener planes duplicados en Mercado Pago.
- **Decisión:** httpx contra la API REST, sin el SDK oficial.
  **Por qué:** son cuatro llamadas y httpx ya es dependencia; evita una dependencia más.
- **Decisión:** el webhook pide el recurso a la API en vez de leer el cuerpo.
  **Por qué:** el cuerpo trae solo el id; el estado real es el de la API, y así una
  notificación repetida o desordenada no deja un estado viejo.
- **Decisión:** al cancelar, el plan sigue hasta `next_payment_at`.
  **Por qué:** el productor ya pagó ese mes. Se usa una tarea propia porque
  `accounts.expire_trials` solo maneja pruebas.
- **Decisión:** una suscripción pausada se trata como una cancelada: conserva el plan hasta
  `next_payment_at` (la guardada, porque Mercado Pago puede no mandarla al pausar) y después
  pasa a Básico.
  **Por qué:** decisión del usuario (2026-11-19). Al pausar se cortan los cobros; antes la
  cuenta se quedaba con el plan pago sin fecha de fin.
  Una pausada se puede reanudar en Mercado Pago:
  - si vuelve a `authorized` después de terminada, el plan vuelve;
  - si la persona se suscribe de nuevo, la pausada terminada se cancela antes en Mercado Pago,
    para que reanudarla no cobre dos veces.
  Una cancelada terminada no se revive.
- **Decisión:** un founder sube a Empresa pagando solo la diferencia con Productor, y al
  darse de baja vuelve a Productor gratis.
  **Por qué:** decisión del usuario (promociones L5): el founder ya tiene Productor gratis para
  siempre, así que cobrarle Empresa entero sería cobrarle lo que se le regaló, y bajarlo a
  Básico rompería esa promesa. Antes no podía pagar nada y una baja lo dejaba con Empresa gratis.
  **Alternativas descartadas:** cobrar Empresa entero; subirlo por pedido al equipo (quedaba
  gratis para siempre).
- **Decisión:** un pago rechazado no baja el plan.
  **Por qué:** Mercado Pago reintenta el cobro y cancela la suscripción si sigue fallando;
  esa cancelación es la que baja el plan.
- **Decisión:** un solo checkout pendiente por cuenta. Suscribirse de nuevo al mismo plan
  devuelve el mismo `checkout_url`; elegir otro plan cancela antes el pendiente en Mercado
  Pago (si no se puede, 502 y no se crea el nuevo). Se serializa con `select_for_update`
  sobre la fila del usuario.
  **Por qué:** el review de T1 mostró que un doble clic creaba dos preapprovals y el
  pagador podía autorizar las dos: dos cobros por mes.
- **Decisión:** si Mercado Pago ya canceló el checkout viejo y después falla crear el nuevo,
  la cancelación local se guarda igual (el bloque hace commit y recién después responde 502).
  **Por qué:** la cancelación remota no se puede deshacer; con rollback la fila quedaba
  `pending` apuntando a un checkout muerto.
- **Decisión:** el lock del usuario se mantiene durante las llamadas HTTP a Mercado Pago.
  **Por qué:** es lo que garantiza un solo checkout por cuenta. El costo es que un Mercado
  Pago lento retiene la fila del usuario hasta el timeout (20 s); solo bloquea a esa cuenta.
  **Alternativas descartadas:** soltar el lock antes de llamar (vuelve la carrera del doble
  clic).
- **Decisión:** la firma se compara en bytes.
  **Por qué:** `hmac.compare_digest` con `str` no ASCII lanza `TypeError`; el webhook daba
  500 en vez de 401.
- **Decisión:** `Payment.payload` guarda solo campos del pago (`PAYLOAD_KEYS`).
  **Por qué:** no guardar datos del pagador, la tarjeta ni la dirección.

## Cómo modificarlo
- Nueva pasarela (dólares): implementar `PaymentProvider`, registrarla en `PROVIDERS` y en
  `PROVIDERS_BY_CURRENCY["USD"]`, y sumar su webhook en `urls.py`.
- El plan cambia solo por `plans.change_plan`; no escribir `user.plan` directo.
- Tests: `backend/tests/test_payments.py` y `test_founder_upgrade.py` (la API de Mercado Pago
  está simulada); en la SPA, `pagos.test.tsx` y `founder-upgrade.test.tsx`.
- Un precio nuevo o un descuento (cupones, referidos) entra por `price_for`, no por
  `plan.price_ars_month` suelto.

## Pendientes
- `ts` de la firma no se valida por antigüedad: una notificación capturada puede repetirse.
  El daño es acotado porque el estado siempre se vuelve a pedir a la API. No se agregó una
  ventana de tiempo sin confirmar cómo manda `ts` Mercado Pago en los reintentos.
- Un pago cuya suscripción todavía no se conoce se responde 200 y no se reintenta: puede
  faltar en el historial (no afecta el plan).
- Una notificación firmada de un recurso que Mercado Pago responde 404 da 502, y Mercado Pago
  la sigue reintentando; podría responderse 200.
- Si Mercado Pago rechaza el alta con un 4xx, el usuario lee "No pudimos conectar con Mercado
  Pago…", que no es exacto.

## Historial
- 2026-11-19: versión inicial (feature `pagos-backoffice`, T1).
- 2026-11-19: un checkout pendiente por cuenta y firma comparada en bytes (review de T1).
- 2026-11-19: la cancelación remota de un checkout viejo no se pierde si falla el nuevo (review del fix).
- 2026-11-19: pantalla de pagos en Tu suscripción (T4).
- 2026-11-19: el webhook responde 401, no 500, ante un cuerpo malformado sin firma (verificación de T1–T4).
- 2026-11-19: una suscripción pausada se trata como cancelada (S8).
- 2026-11-19: prueba de punta a punta en el sandbox, en local y sin túnel; receta corregida.
- 2026-11-19: un founder sube a Empresa pagando la diferencia y al darse de baja vuelve a
  Productor (promociones SF).
- 2026-11-19: `suscribirme/` exige `acepta_terminos`, la SPA muestra el resumen antes de pagar y
  la suscripción autorizada manda un email de confirmación (feature `promociones`, S0b, S0d, S0e).
- 2026-11-20: borrar la cuenta cancela antes la suscripción en Mercado Pago.
- 2026-11-20: cambios de precio programados y su email de aviso (feature `avisos-cambios`, T1).
- 2026-11-20: el cambio de precio se aplica en Mercado Pago en su fecha (`avisos-cambios`, T2).
- 2026-11-20: el cambio programado lleva también el precio en dólares, que el plan toma en su
  fecha (`avisos-cambios`, T5).
