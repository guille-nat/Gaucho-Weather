# Frontend PWA
> Última actualización: 2026-11-03

## Qué hace
App web instalable (PWA), mobile first. Primero es una app del clima (S8): al abrirla
muestra, sin cuenta, el pronóstico de donde está el teléfono o del lugar que se busque,
con un veredicto "Para el campo". Con cuenta suma las herramientas: lotes con su
pronóstico y sus decisiones (helada, pulverización, labores), alertas y perfil. Sin
señal se siguen viendo los últimos datos.

## Cómo funciona
- **Stack:** Vite + React + TypeScript estricto, React Router, TanStack Query, pnpm.
  Código en `frontend/`.
- **Pantallas** (`frontend/src/pages/`):
  - `/` Inicio (`Inicio.tsx`), pública: lugar, temperatura grande, condición, máx/mín,
    el veredicto dorado "Para el campo", 48 h, 7 días, lluvia caída y esperada, viento,
    humedad y sol. Datos de `GET /api/pronostico/?lat&lon` (S10).
  - `/buscar` (`Buscar.tsx`), pública: búsqueda con debounce de 300 ms en
    `/api/lugares/?q=`, lugares recientes y "Usar mi ubicación".
  - `/ingresar` y `/crear-cuenta`. Sin destino previo, al entrar se va a `/lotes`.
  - Con cuenta (`RequireAuth`): `/lotes` Mis lotes, `/lotes/nuevo`, `/lotes/:id`,
    `/lotes/:id/editar`, `/alertas` y `/perfil`. Anónimo, estas pestañas llevan a
    `/ingresar` y vuelven después.
  - El detalle del lote reusa el layout de Inicio (`components/ForecastView.tsx`) con
    `GET /api/lotes/{id}/pronostico/` (S5) y el bloque completo de decisiones.
- **Ubicación y lugares:** al abrir Inicio se pide la ubicación del navegador, salvo que
  el usuario haya elegido un lugar. Si la niega, se muestra el último lugar o Rosario y
  una invitación a buscar. El nombre del punto GPS sale de `/api/lugares/reverso/`; si
  no hay nombre (por ejemplo, fuera de la Argentina) se muestran las coordenadas.
  El lugar actual y los 6 recientes se guardan en localStorage (`src/lib/places.ts`).
- **Errores del pronóstico:** se muestra el `detail` del servidor tal cual (400 "Por
  ahora solo cubrimos Argentina." con botón de búsqueda; 503 con "Reintentar").
- **Probabilidad de lluvia:** un lugar nuevo no tiene ensamble y llega `null`; se
  muestran solo los mm y se omite la probabilidad, nunca "0 %".
- **Créditos:** Open-Meteo y Georef AR son CC BY 4.0; la línea de créditos va al pie
  del pronóstico, en la búsqueda y en Perfil.
- **API** (`src/api/client.ts`): `fetch` same-origin con la cookie de sesión de Django.
  - Pide `GET /api/auth/csrf/` una vez y manda `X-CSRFToken` en POST, PATCH y DELETE.
  - Lee la cookie en cada pedido, porque Django la rota al ingresar.
  - Ante un 403 de CSRF pide un token nuevo y reintenta una sola vez.
  - Un 403 en `/api/auth/me/` significa "anónimo" y el guard manda a `/ingresar`.
  - Un 401, o un 403 que no sea de CSRF, en cualquier otro pedido (consulta o guardado)
    también termina la sesión.
- **Sin señal:**
  - TanStack Query guarda el usuario y los lotes en IndexedDB (`src/query/persister.ts`),
    hasta 7 días.
  - La lista se guarda como `LotesSnapshot` (`src/api/types.ts`): los lotes, la hora en
    que el servidor produjo la respuesta (header `Date`) y si vino del caché del service worker.
  - Sin conexión se muestra lo último guardado con "Sin conexión · datos de las HH:MM",
    en hora argentina. La hora es la del servidor, nunca la de la descarga.
  - La barra superior dice "Pronóstico de las HH:MM": el `fetched_at` más nuevo de los
    resúmenes, igual que el "Pronóstico descargado a las …" del detalle.
  - El service worker (vite-plugin-pwa / Workbox) precachea el app shell y las fuentes.
  - Usa network-first para `/api/lotes/` (caché `api-lotes`, privado) y para
    `/api/pronostico/` y `/api/lugares/` (caché `api-publico`, por URL). Nunca cachea
    `/api/auth/`.
  - El pronóstico público también se persiste en IndexedDB (raíz `pronostico`), así
    Inicio abre sin señal con el último lugar.
  - Cuando responde desde su caché agrega el header `X-From-SW-Cache: 1` (plugin
    `cachedResponseWillBeUsed` en `vite.config.ts`); la app lo trata como "sin conexión".
  - Después de crear, editar o borrar un lote, el caché se escribe en IndexedDB antes de
    cambiar de pantalla (`flush`), para que una recarga inmediata no lo pierda.
- **Fin de sesión** (`src/query/session.ts`, `AppProviders.tsx`):
  - Cada vez que `me` pasa a `null` (403 en `/me`, otro 401/403, salir) se borran las
    consultas, la copia en IndexedDB y el caché `api-lotes` del service worker, con el
    pronóstico de cada lote incluido. El pronóstico público y los lugares quedan
    (`PUBLIC_ROOTS` en `src/query/keys.ts`, caché `api-publico`).
  - `AppShell` consulta `me` en todas las pantallas, también en Inicio, para que el
    borrado y el logout pendiente ocurran aunque no se abra una pantalla privada.
  - Al ingresar o crear cuenta se borra lo mismo antes de guardar el usuario nuevo.
  - Si al salir no hay señal, se sale igual en el teléfono y el login lo avisa. Queda la
    marca `gw-pending-logout` en localStorage y el próximo chequeo de sesión con señal
    cierra la sesión en el servidor antes que nada.
- **Mapa:** MapLibre GL con teselas de OpenFreeMap, sin API key.
  - Se carga en un chunk aparte (`src/components/MapPicker.tsx`) solo al agregar o
    editar un lote.
  - Hay botón "Usar mi ubicación" y campos de latitud y longitud.
- **Diseño "Cielo vivo"** (S9, contrato `.impeccable/surfaces/frontend-src-pages-inicio-tsx.md`):
  - Toda la app toma el color del cielo del lugar en pantalla: `src/lib/sky.ts` elige
    el tema por el cielo del día, la hora y la salida y puesta del sol (día, parcial,
    nublado, lluvia, tormenta, alba, noche y sus variantes nocturnas).
  - Los colores están en `src/styles/tokens.css`. `--sky-a` y `--sky-b` son `@property`
    registradas, así el cambio de cielo es un fundido de 1,6 s; con movimiento reducido
    es instantáneo. Paneles sólidos mezclados del mismo cielo, sin blur.
  - Texto blanco; contraste AA verificado en los 9 cielos (blanco ≥ 5,4:1 y el texto
    secundario ≥ 4,6:1 sobre el color más claro).
  - Acento dorado `#f2b705` solo para el veredicto del campo, el nivel "Ojo" y la marca.
  - Fuentes: Onest (números y títulos) y Atkinson Hyperlegible Next (texto).
  - El nivel de cada decisión va con ícono y palabra (Bien, Ojo, Alerta), nunca solo
    con color. `ParcelOutline` tiñe el lote según el nivel de su `summary.headline`.
- **Docker:** `frontend/Dockerfile` tiene dos targets, `dev` (Vite en 5173) y `prod`
  (nginx).
  - `prod` sirve `dist` con fallback SPA y hace proxy de `/api/` a `backend:8000`
    (`frontend/nginx.conf`).

## Decisiones y por qué
- **Decisión:** cookie de sesión + CSRF, sin JWT.
  **Por qué:** evita la carrera de refresh de tokens de la v1 (S6).
- **Decisión:** persistir el caché de TanStack Query en IndexedDB y no en localStorage.
  **Por qué:** es asíncrono y no tiene el límite de 5 MB. Además, la app ya usa
  TanStack para los datos.
  **Alternativas descartadas:** cachear solo con el service worker. No avisa la hora de
  los datos ni sirve en el primer render.
- **Decisión:** al salir se borran el caché de consultas, IndexedDB y el caché `api-lotes`.
  **Por qué:** el teléfono puede ser compartido; los lotes de un usuario no deben quedar
  a la vista del siguiente.
  (ampliada el 2026-11-03: se borra en cualquier fin de sesión y al empezar una nueva,
  no solo al tocar Salir; el verificador encontró que un 403 dejaba los datos guardados)
- **Decisión:** si Salir falla sin señal, se sale igual en el teléfono y el logout del
  servidor queda pendiente para la próxima vez con señal.
  **Por qué:** la cookie de sesión es httpOnly y solo el servidor la puede cerrar; el
  productor que toca Salir espera que el teléfono quede limpio ya.
- **Decisión:** las respuestas que el service worker sirve desde su caché llevan
  `X-From-SW-Cache: 1`, y la hora mostrada sale del header `Date` del servidor.
  **Por qué:** sin conexión, Workbox contesta 200 desde el caché y TanStack creía que los
  datos eran nuevos: el aviso "Sin conexión" no aparecía y la hora era la de ahora.
  **Alternativas descartadas:** forzar `onlineManager` a offline; con señal mala el
  navegador no avisa cuando vuelve la red y la app quedaba trabada.
- **Decisión:** fuentes self-hosted con @fontsource (Atkinson Hyperlegible Next y Barlow
  Semi Condensed), solo el subset latin. (Barlow reemplazada el 2026-11-03 por Onest:
  grotesca moderna con cifras grandes para "Cielo vivo".)
  **Por qué:** tienen que funcionar sin conexión, y el subset latin alcanza para el
  castellano.
- **Decisión:** las horas se muestran en `America/Argentina/Buenos_Aires`, sin importar
  la zona del dispositivo.
  **Por qué:** el producto es de la zona núcleo, y así los tests son deterministas.
- **Decisión:** (reemplazada el 2026-11-03 por las decisiones del motor v0, S3/S5, con
  la aclaración "Estimación con reglas publicadas; todavía sin validar en tu zona") la
  mínima se muestra como "pronóstico, no es todavía un aviso de helada", con el valor de
  cada modelo.
  **Por qué:** en Fase 1 no hay motor de decisiones y no se inventan veredictos.
  (reemplazada el 2026-11-03: la aclaración va en tinta junto al valor, "Temperatura a
  2 m de altura. Todavía no calculamos la helada a nivel del suelo." en el detalle y
  "Aún no calculamos la helada en el suelo." en la tarjeta; los modelos quedan detrás de
  "Ver modelos". Por qué: la revisión de diseño marcó que en gris debajo del número se
  leía como "no hiela".)
- **Decisión:** (reemplazada el 2026-11-03 por la barra Clima · Lotes · Alertas · Perfil,
  porque el clima pasó a ser la pantalla principal, S8) la barra inferior tiene Lotes,
  Alertas y Perfil, sin Pronóstico.
  **Por qué:** en Fase 1 no hay pantalla de pronóstico, y una pestaña vacía confunde.
  Pronóstico vuelve cuando exista esa pantalla. Registrado en la sección Decisions del
  brief de diseño. (sin confirmar con el usuario)
- **Decisión:** la búsqueda es una ruta (`/buscar`) con forma de hoja, no un modal.
  **Por qué:** el botón Atrás del teléfono la cierra, se enfoca sola y no hace falta
  atrapar el foco.
- **Decisión:** el veredicto "Para el campo" usa la regla del titular del backend: gana
  el peor nivel; en empate, helada, labores y pulverización; la pulverización no cuenta
  después de la puesta del sol (`src/lib/decisions.ts`).
  **Por qué:** después del atardecer "ya no quedan horas de luz" no dice nada del día.
- **Decisión:** las barras de lluvia de los 7 días usan una sola escala: el día más
  lluvioso, con un piso de 5 mm.
  **Por qué:** comparar días es el uso; el piso evita que 0,1 mm parezca una barra llena.
- **Decisión:** el modo mock (`pnpm dev:mock`) responde `/api/` dentro de la página con
  los mismos handlers MSW de los tests, sin service worker.
  **Por qué:** permite ver la app y sacar capturas sin backend, también en Chrome headless.
  `?cielo=sol|lluvia|noche` elige el pronóstico público de prueba.

## Cómo modificarlo
- **Contrato de la API:** los tipos están en `src/api/types.ts` y el mock en
  `src/mocks/handlers.ts`.
  - Si cambia el contrato S8, actualizá los dos.
  - Si cambia la forma de lo que se persiste, subí `PERSIST_BUSTER` en
    `src/query/persister.ts` (va por `v2` desde `LotesSnapshot`).
- **Un cielo nuevo:** agregalo a `SkyTheme` y `THEME_COLOR` (`src/lib/sky.ts`) y a
  `tokens.css`, y verificá el contraste del blanco.
- **Contrato del pronóstico:** tipos en `src/api/types.ts`, datos de prueba en
  `src/mocks/forecast.ts`.
- **Tests** (`src/test/`, Vitest + Testing Library + MSW): login, registro, guard,
  CSRF, lista, estado vacío, datos offline, validación del formulario y resumen.
  `inicio.test.tsx` cubre Inicio y la búsqueda (ubicación, ubicación negada, búsqueda,
  400/503, escala de lluvia, veredicto, sin ensamble, pestaña Lotes anónima).
  `session.test.tsx` cubre el borrado de datos al terminar o empezar una sesión;
  `src/test/localData.ts` siembra IndexedDB y simula `caches`.
  Ejecutalos con `pnpm test`.
- **Proxy de desarrollo:** `VITE_API_PROXY_TARGET`. Por defecto es
  `http://localhost:8001`; en compose es `http://backend:8000`.

## Historial
- 2026-11-03: primera versión (Fase 1, T5).
- 2026-11-03: corrección del verificador (borrado de datos en todo fin de sesión, hora
  real de los datos sin conexión, flush tras guardar) y de la revisión de diseño
  (aclaración en tinta, hora del pronóstico, rayado en tinta, tarjetas más compactas,
  modelos detrás de "Ver modelos", sin ejemplos como placeholder).
- 2026-11-03: el clima primero (T6, S1, S8, S9, S10): Inicio público con búsqueda,
  rediseño "Cielo vivo" de toda la app, detalle del lote con pronóstico y decisiones,
  caché público del service worker y créditos CC BY 4.0. Salir navega en el mismo tick
  que termina la sesión, porque antes el guard redirigía primero y se perdía el aviso.
