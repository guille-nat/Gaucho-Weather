# Pagos con Mercado Pago
> Última actualización: 2026-11-19

## Qué hace
Un productor se suscribe a un plan pago (Agrónomo o Productor) y Mercado Pago le cobra
todos los meses en pesos. El plan de la cuenta cambia solo cuando Mercado Pago avisa que la
suscripción quedó autorizada. Pagar en dólares todavía no existe. Vive en
`backend/apps/payments` y responde bajo `/api/pagos/`.

## Cómo funciona

### Flujo
1. La SPA llama `POST /api/pagos/suscribirme/` con `{plan, currency: "ARS"}`.
2. El backend crea una suscripción en Mercado Pago (`POST /preapproval`, mensual, en ARS).
   Guarda una `ProviderSubscription` en `pending` y devuelve `{checkout_url}`.
3. El productor paga en Mercado Pago y vuelve a `PUBLIC_APP_URL/perfil/suscripcion?pago=ok`.
4. Mercado Pago llama al webhook. El backend verifica la firma, **pide el recurso a la API**
   (no confía en el cuerpo) y aplica la regla:
   - suscripción `authorized`: `change_plan(..., reason="payment")`, que termina la prueba;
   - suscripción `cancelled`: la cuenta conserva el plan hasta `next_payment_at` y después
     pasa a Básico con `payment_ended`. Si nunca se pagó (venía de `pending`), se cierra sin
     tocar el plan;
   - pagos (`payment` y `subscription_authorized_payment`): se crea o actualiza el `Payment`
     por su id de Mercado Pago. Un pago rechazado no baja el plan.
5. La tarea `payments.end_cancelled_subscriptions` corre cada hora (minuto 30) y pasa a
   Básico las suscripciones canceladas cuyo mes pago ya terminó.

### Endpoints
| Método y ruta | Qué hace |
|---|---|
| `GET /api/pagos/` | `payments_enabled`, la suscripción actual (o `null`) y los últimos 50 pagos. |
| `POST /api/pagos/suscribirme/` | 201 `{checkout_url}`. |
| `POST /api/pagos/cancelar/` | Cancela en Mercado Pago; devuelve lo mismo que `GET /api/pagos/`. |
| `POST /api/pagos/mercadopago/webhook/` | Público, sin CSRF; la firma es la autenticación. |

`GET /api/planes/` suma `payments_enabled`.

Rechazos de `suscribirme/` (todos con `detail` en español):

| Caso | Código |
|---|---|
| Plan inexistente, Básico, founder, ya suscripto, o ya está en ese plan sin prueba | 400 |
| `currency: "USD"`: "Pagar en dólares todavía no está disponible." | 409 |
| El plan no tiene precio en pesos | 409 |
| Mercado Pago no configurado: "Los pagos todavía no están habilitados." | 503 |
| Mercado Pago no responde | 502 |

`cancelar/` sin suscripción activa responde 404. Las cuentas sin suscripción de Mercado Pago
siguen usando el pedido de baja de siempre (`/api/auth/suscripcion/`), sin cambios.

### Webhook
- Firma inválida o ausente: 401. Sin credenciales configuradas: 503.
- Si la API de Mercado Pago falla, responde 502 para que Mercado Pago reintente.
- Es idempotente: la suscripción se busca por su `external_id` con `select_for_update`, y el
  pago se guarda con `update_or_create` sobre su id único.
- Una notificación de una suscripción o un pago desconocido se ignora con 200.

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

## Probar en el sandbox
1. En el panel de Mercado Pago, "Tus integraciones", creá (o abrí) la aplicación con
   suscripciones, y creá un vendedor y un comprador de prueba.
2. Copiá el access token `TEST-...` del vendedor de prueba en `MERCADOPAGO_ACCESS_TOKEN`.
3. En "Webhooks > Configurar notificaciones" cargá la URL pública
   `https://<tu-dominio>/api/pagos/mercadopago/webhook/` con los eventos de suscripciones y
   pagos, y copiá la clave secreta en `MERCADOPAGO_WEBHOOK_SECRET`. En local hace falta un
   túnel (por ejemplo ngrok o cloudflared) hacia el backend.
4. Reiniciá `backend` y `worker`, suscribite desde la app con el email del comprador de
   prueba y pagá con una tarjeta de prueba.
5. En el admin (`/api/admin/`, sección `Payments`) tienen que aparecer la suscripción `authorized` y el
   pago, y la cuenta en el plan elegido.

En producción se usan las credenciales `APP_USR-...` de la cuenta real; la URL de la API es
la misma.

## Decisiones y por qué
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
- **Decisión:** un pago rechazado no baja el plan.
  **Por qué:** Mercado Pago reintenta el cobro y cancela la suscripción si sigue fallando;
  esa cancelación es la que baja el plan.
- **Decisión:** un solo checkout pendiente por cuenta. Suscribirse de nuevo al mismo plan
  devuelve el mismo `checkout_url`; elegir otro plan cancela antes el pendiente en Mercado
  Pago (si no se puede, 502 y no se crea el nuevo). Se serializa con `select_for_update`
  sobre la fila del usuario.
  **Por qué:** el review de T1 mostró que un doble clic creaba dos preapprovals y el
  pagador podía autorizar las dos: dos cobros por mes.
- **Decisión:** la firma se compara en bytes.
  **Por qué:** `hmac.compare_digest` con `str` no ASCII lanza `TypeError`; el webhook daba
  500 en vez de 401.
- **Decisión:** `Payment.payload` guarda solo campos del pago (`PAYLOAD_KEYS`).
  **Por qué:** no guardar datos del pagador, la tarjeta ni la dirección.

## Cómo modificarlo
- Nueva pasarela (dólares): implementar `PaymentProvider`, registrarla en `PROVIDERS` y en
  `PROVIDERS_BY_CURRENCY["USD"]`, y sumar su webhook en `urls.py`.
- El plan cambia solo por `plans.change_plan`; no escribir `user.plan` directo.
- Tests: `backend/tests/test_payments.py` (la API de Mercado Pago está simulada).

## Pendientes
- Una suscripción `paused` mantiene el plan pago sin fecha de fin (falta decidir qué hacer).
- `ts` de la firma no se valida por antigüedad: una notificación capturada puede repetirse.
  El daño es acotado porque el estado siempre se vuelve a pedir a la API. No se agregó una
  ventana de tiempo sin confirmar cómo manda `ts` Mercado Pago en los reintentos.
- Un pago cuya suscripción todavía no se conoce se responde 200 y no se reintenta: puede
  faltar en el historial (no afecta el plan).

## Historial
- 2026-11-19: versión inicial (feature `pagos-backoffice`, T1).
- 2026-11-19: un checkout pendiente por cuenta y firma comparada en bytes (review de T1).
