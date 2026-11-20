# Términos, privacidad y reglas
> Última actualización: 2026-11-19

## Qué hace
La app publica tres textos: Términos y condiciones (`/terminos`), Política de privacidad
(`/privacidad`) y Reglas del programa (`/reglas`, founders, prueba y suscripciones). Cada cuenta
los acepta al crearse, al suscribirse y cada vez que salen en una versión nueva. Antes de ir a
Mercado Pago, Suscripción resume en palabras simples lo que se contrata, y al autorizarse la
suscripción llega un email de confirmación. Es la parte S0 de `odd/tasks/promociones.md`.

**Los textos son borradores.** Tienen datos del negocio entre corchetes que faltan completar, y
un abogado los revisa antes de salir a producción (Ley 24.240 y Ley 25.326).

## Cómo funciona

### Versión
- Una sola versión para los tres textos: `TERMS_VERSION` en `backend/apps/accounts/terms.py`
  y la misma en `frontend/src/lib/terms.ts`. Es la fecha en que rige (`2026-11-19`).
- Las páginas la muestran: "Versión 2026-11-19 · Vigente desde el 19 de noviembre de 2026".
- `frontend/src/test/terminos.test.tsx` lee `terms.py` y falla si las dos versiones difieren.

### Aceptación
- Modelo `TermsAcceptance` (`user`, `version`, `accepted_at`, `context`): `signup`, `subscribe`
  o `update`. Se ve, de solo lectura, en la ficha del usuario del admin de Django.
- `POST /api/auth/register/` exige `acepta_terminos: true`. Si falta o es `false` responde 400
  `{"acepta_terminos": ["Tenés que aceptar los términos y la política de privacidad."]}`, junto
  con los demás errores de campo. El alta guarda una aceptación `signup`.
- `POST /api/pagos/suscribirme/` exige lo mismo, con el mismo mensaje, antes de cualquier otro
  rechazo. Guarda una aceptación `subscribe` solo cuando entrega el checkout.
- `GET /api/auth/me/` suma `terms_version` (la vigente) y `terms_accepted` (si la cuenta
  aceptó esa versión). También los devuelven el login y el alta.
- `POST /api/auth/terminos/aceptar/` guarda una aceptación `update` (una sola vez por versión)
  y devuelve la cuenta como `me/`. Pide sesión y CSRF.

### Pantallas
- Los links a las tres páginas están en el pie del ingreso y del alta, en Perfil, en Planes y
  en Suscripción.
- Crear cuenta tiene la casilla "Leí y acepto los Términos y condiciones, la Política de
  privacidad y las Reglas del programa.". Se manda tal cual: el error lo da el servidor.
- **Términos actualizados:** con `terms_accepted: false`, el shell de la app muestra un diálogo
  modal "Actualizamos los términos" con los links, "Acepto" y "Salir". Esc no lo cierra y, si
  el navegador lo cierra igual, se vuelve a abrir. "Salir" es la misma salida que Perfil
  (`lib/useSignOut.ts`). Las cuentas que ya existían, founders incluidos, lo ven una vez después
  del deploy, porque no tienen aceptaciones.
- **Resumen antes de pagar:** "Suscribirme" abre "Antes de ir a Mercado Pago" con el monto por
  mes (para un founder, la diferencia con Productor), que se renueva automáticamente, que el
  primer cobro es ahora, que "Darme de baja" está en la misma página, que el mes pago se
  conserva, y la casilla de los términos. Recién "Ir a Mercado Pago" crea la suscripción.

### Email de confirmación
- Cuando el webhook ve que una suscripción pasa de `pending` a `authorized`, se manda un email
  (después del commit) con el plan, el monto, la frecuencia, cómo darse de baja y los links a
  los tres textos.
- `ProviderSubscription.confirmation_sent_at` marca que salió: nunca se manda dos veces. No sale
  para `pending`, `cancelled` o `paused`, ni por un webhook repetido, ni al reanudar una pausa,
  ni para suscripciones autorizadas antes de que existiera el email.
- Si el envío falla se registra en el log y el plan no se toca.

## Decisiones y por qué
- **Decisión:** los textos viven en el código de la SPA, no en la base.
  **Por qué:** cada cambio queda versionado y revisado en el repositorio, junto con su versión.
- **Decisión:** una sola versión para los tres textos.
  **Por qué:** se aceptan juntos; una versión por texto obligaría a pedir tres aceptaciones.
- **Decisión:** el diálogo bloquea toda la app, pero no las páginas legales.
  **Por qué:** lo que no se aclara se da por sentado (L4). Las páginas quedan fuera del shell
  para poder leerlas antes de aceptar.
- **Decisión:** el email sale solo en el paso de `pending` a `authorized`, con una marca en la
  suscripción.
  **Por qué:** Mercado Pago repite notificaciones y una pausa reanudada vuelve a `authorized`.
  Así nunca se manda dos veces y no se cambian datos ya guardados.
- **Decisión:** datos del negocio y plazos desconocidos como marcadores visibles.
  **Por qué:** no se inventan datos legales; un marcador a la vista no pasa a producción sin que
  alguien lo note.

## Cómo modificarlo
- Cambiar un texto: editarlo en `frontend/src/pages/legal/`, subir `TERMS_VERSION` en los dos
  lados a la fecha en que rige, y avisar por email antes de esa fecha. Todas las cuentas vuelven
  a ver el diálogo.
- Cupones, referidos y meses gratis suman sus reglas a `/reglas` cuando se lancen.
- Marcadores a completar: `[RAZÓN SOCIAL]`, `[CUIT]`, `[DOMICILIO]`, `[EMAIL DE CONTACTO]`,
  `[JURISDICCIÓN]`, `[PLAZO]` (copias de seguridad y registros del servidor) y
  `[PROVEEDOR DE EMAIL]`. Completados el 2026-11-19: hosting = Hostinger; aviso de cambio de
  precio = 30 días.
- Tests: `backend/tests/test_terms.py` y `frontend/src/test/terminos.test.tsx`.

## Pendientes
- Revisión de un abogado antes de salir a producción.
- Borrar la cuenta no cancela la suscripción en Mercado Pago. Los términos piden darse de baja
  antes; falta que la app lo haga o lo impida.

## Historial
- 2026-11-19: versión inicial (feature `promociones`, S0a–S0e).
