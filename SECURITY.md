# Seguridad

Estado de seguridad de Gaucho Weather: qué se encontró, qué se corrigió y qué
queda pendiente de una acción tuya.

Revisión: 2026-07-28.

---

## Pendiente — requiere acción del titular

### Clave privada versionada

`server.key` (una clave PKCS#8) estuvo commiteada en el repositorio.

**Ya se hizo:** se sacó del índice con `git rm --cached` y `.gitignore` ahora
cubre `*.key` y `*.pem`. El archivo sigue en disco.

**Falta hacer, en este orden:**

1. **Rotar la clave.** Es lo único que realmente cierra el problema. Cualquiera
   que haya clonado el repo ya la tiene, y borrarla del historial no se la
   quita.

2. Borrarla del historial:

   ```bash
   pip install git-filter-repo
   git filter-repo --path server.key --invert-paths
   git push --force --all
   ```

   > Reescribe el historial: todos los clones existentes quedan
   > desincronizados y hay que volver a clonar. Coordinalo con el equipo.

3. Revocar el certificado asociado, si lo hubiera.

CI ya bloquea la reincidencia: el job `hygiene` falla si aparece cualquier
`.key`, `.pem`, `.p12`, `.pfx` o `.env` versionado.

---

## Corregido

### 1. Respuestas autenticadas cacheadas entre usuarios — crítico

`config/base.py` cargaba `UpdateCacheMiddleware` y `FetchFromCacheMiddleware`,
que cachean toda respuesta GET durante 600 s usando **la URL como clave**.

La API autentica con JWT en el header `Authorization`, no con cookie de sesión.
Django agrega `Vary: Cookie` solo si la sesión fue tocada — con JWT no se toca.
Resultado: `GET /api/users/profiles` quedaba cacheado por el primer usuario que
lo pedía y **se le servía a cualquier otro durante los 10 minutos siguientes**.
Nombre, apellido, correo y preferencias de una persona entregados a otra.

**Corrección:** se sacaron ambos middlewares. El cacheo ahora es explícito en
cada vista de `weather/`, que es donde se sabe qué datos son públicos.

**Regresión cubierta:** `users/tests/test_security.py::ResponseCacheIsolationTests`

### 2. Contraseñas guardadas en texto plano — crítico

`UserSerializer` no sobreescribía `update()`. La implementación por defecto de
`ModelSerializer` hace `setattr(instance, 'password', valor)`, así que un
`PATCH /api/users/update` con el campo `password` **escribía la contraseña sin
hashear** en la base. El usuario además quedaba sin poder entrar, porque
`check_password` compara contra un hash.

**Corrección:** `update()` usa `set_password()`.

**Regresión cubierta:** `users/tests/test_security.py::PasswordHandlingTests`

### 3. Contraseñas sin validar en la API — alto

`ModelSerializer` no aplica `AUTH_PASSWORD_VALIDATORS`. El formulario del
frontend exigía 8 caracteres, pero la API aceptaba `"1"`.

**Corrección:** `validate_password()` en el serializer, y mínimo de 8
caracteres explícito en `AUTH_PASSWORD_VALIDATORS`.

**Regresión cubierta:** `users/tests/test_security.py::RegistrationValidationTests`

### 4. CORS abierto con credenciales — alto

`CORS_ALLOW_ALL_ORIGINS = True` junto con `CORS_ALLOW_CREDENTIALS = True`:
cualquier sitio podía hacer pedidos autenticados en nombre del usuario.

**Corrección:** en producción, `CORS_ALLOWED_ORIGINS` explícito y obligatorio.
El proceso no arranca si está vacío. La permisividad quedó solo en
`config/developer.py`.

### 5. DEBUG activo en producción — alto

`config/production.py` tenía `DEBUG = True` y `ALLOWED_HOSTS = ["*"]`, ambos
con un comentario que advertía justamente eso. Con `DEBUG` activo, cualquier
excepción devuelve el stack trace y fragmentos de configuración.

**Corrección:** `DEBUG = False` fijo; `ALLOWED_HOSTS` desde el entorno, sin
comodines y obligatorio.

### 6. Tokens de refresco válidos tras rotarse — medio

`ROTATE_REFRESH_TOKENS = True` con `BLACKLIST_AFTER_ROTATION = False`: al
rotar, el token viejo seguía sirviendo hasta vencer. Un refresh robado
permanecía utilizable aunque la víctima siguiera usando la app.

**Corrección:** `BLACKLIST_AFTER_ROTATION = True`. El access se acortó de 1 día
a 15 minutos configurables.

### 7. Documentación de la API pública — medio

`/api/doc` y `/api/redoc` se servían siempre con `AllowAny`, publicando toda la
superficie de la API.

**Corrección:** se publican solo con `ENABLE_API_DOCS=true`, apagado por
defecto.

### 8. Sin límite de peticiones — medio

Nada frenaba la fuerza bruta contra el login ni el consumo de la cuota de
Tomorrow.io, que se factura por request.

**Corrección:** throttling de DRF (`anon` y `user`, configurables), un límite
propio de 5/hora para el recupero de contraseña, y `limit_req` en Nginx.

### 9. Enumeración de usuarios en el recupero — medio

**Prevenido en el diseño:** `password_reset_request` responde siempre lo mismo,
exista o no la cuenta. Sin eso, el endpoint sirve para averiguar qué correos
están registrados.

**Regresión cubierta:** `users/tests/test_account_flows.py::PasswordResetTests::test_email_inexistente_responde_igual`

### 10. Contenedores corriendo como root — medio

**Corrección:** la etapa de producción del backend crea el usuario `django`
(uid 1001) y corre con él.

### 11. Email no único — medio

`AbstractUser` no exige unicidad. Dos cuentas podían compartir correo, lo que
vuelve ambiguo el recupero de contraseña.

**Corrección:** `unique=True` sobre `email`, más validación en el serializer.

> Al migrar una base existente con correos duplicados, la migración falla.
> Ver el procedimiento en [DEPLOYMENT.md](DEPLOYMENT.md#10-deploy-de-una-versión-nueva).

### 12. Datos de terceros sin validar — bajo

`favorite_location` es un `JSONField` libre: entraba cualquier estructura y
rompía en el frontend.

**Corrección:** validación de forma y de rango de coordenadas.

---

## Decisiones deliberadas

| Decisión | Por qué |
|----------|---------|
| `SECURE_HSTS_SECONDS=3600` por defecto | Los navegadores recuerdan la política. Empezar bajo y subir a un año cuando el certificado renueve solo. Ver [DEPLOYMENT.md](DEPLOYMENT.md#endurecer-hsts) |
| `SECURE_HSTS_INCLUDE_SUBDOMAINS=false` | Activarlo obliga a que **todo** subdominio sea HTTPS, incluidos los que no existen todavía |
| `VITE_GOOGLE_MAPS_API_KEY` en el bundle | Vite congela las variables en el build; es pública por diseño. Se protege por referrer HTTP |
| Endpoints de clima públicos | El pronóstico no es información sensible; pedir login sería fricción sin beneficio |
| `IGNORE_EXCEPTIONS` en Redis | Si la caché se cae, la app responde más lento en vez de devolver 500 |
| Sesiones en base y no en caché | Un flush de Redis no debe desloguear a nadie |
| Alertas solo a correos verificados | Si no, el sistema sirve para mandar mails a direcciones ajenas |

---

## Pendientes conocidos

Ninguno bloquea el pase a producción, pero conviene atenderlos:

- **Sin auditoría de dependencias en CI.** Agregar `pip-audit` y `npm audit`.
- **Sin verificación en dos pasos para el admin.** Evaluar `django-otp` si el
  panel queda expuesto a internet.
- **Logs sin centralizar.** Van a stdout; el runtime los recolecta, pero no hay
  agregación ni alertas.
- **Sin monitoreo de errores.** Considerar Sentry para enterarse de las fallas
  antes que los usuarios.
- **El admin queda accesible en `/api/admin/`.** Restringirlo por IP en Nginx
  si no lo usás desde direcciones variables.

---

## Reportar una vulnerabilidad

Escribí a guillermonatali22@gmail.com. No abras un issue público.
