# Frontend PWA
> Última actualización: 2026-11-16

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
    `/api/lugares/?q=`, lugares guardados y recientes, y "Usar mi ubicación".
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
  El lugar actual, los 6 recientes y los guardados viven en localStorage
  (`src/lib/places.ts`). Cada fila de Buscar tiene una estrella (`aria-pressed`) que
  guarda el lugar. Los guardados aparecen en "Guardados", arriba de "Recientes", y una
  búsqueda nueva nunca los desplaza, porque el productor vuelve siempre a los mismos
  pueblos. No hay tope de guardados, porque cada lugar ocupa unos pocos bytes.
- **Cielo animado** (`components/SkyMotion.tsx`, `lib/atmosphere.ts`, `lib/skyMotion.ts`):
  - El color del cielo y la condición del bloque "Ahora" siguen `now.sky`, el cielo de
    esta hora. Un pronóstico guardado antes por el service worker usa el del día.
  - Solo en Inicio y en el detalle del lote, un canvas fijo detrás del contenido dibuja
    la lluvia, las nubes, los relámpagos y las estrellas. Cada efecto sale de un dato:
    los mm de la hora, la nubosidad y el viento. Un día despejado y calmo no se mueve.
    `PRODUCT.md` rechaza las "animaciones de nubes que no informan nada".
  - Accesibilidad: el canvas es `aria-hidden` y no recibe toques. Hay un botón "Pausar
    el cielo" junto a la temperatura (WCAG 2.2.2) que este teléfono recuerda en
    `gw-sky-motion`. Con `prefers-reduced-motion` se dibuja un cuadro quieto y no hay
    botón. El relámpago cae cada 6 a 14 s (WCAG 2.3.1).
  - Contraste: el blanco que agrega la capa se limita al presupuesto de cada tema
    (`whiteBudget`). Las nubes usan el tono del cielo velado con su misma luminancia
    (`cloudTone`), así nunca le bajan el contraste al texto.
  - Costo: unos 30 cuadros por segundo, densidad de píxeles hasta 2 y nada mientras la
    pestaña está oculta.
  - `body` no tiene fondo: uno opaco tapaba el canvas y también el degradado de
    `body::before`, que no se veía desde el rediseño "Cielo vivo". El color de respaldo
    está en `html`.
  - Mock: `?ahora=sol|parcial|nublado|lluvia|tormenta` fuerza el cielo de esta hora.
    `?cielo=noche&ahora=sol` es una noche estrellada.
- **Motion** (feature `motion-pass`; reglas completas en `DESIGN.md` › Motion):
  - Al cambiar de pestaña, la lente de vidrio viaja a la pestaña nueva (`<ViewTransition
    name="tab-lens">` en `AppShell.tsx`) y la página hace un fundido. Funciona porque
    `BrowserRouter` envuelve cada navegación en `React.startTransition`. La prop
    `viewTransition` de `Link` no se usa: está deprecada y no anda con `BrowserRouter`.
  - El pronóstico entra escalonado solo si la espera se llegó a ver (≥ 120 ms,
    `REVEAL_AFTER_MS` en `ForecastView.tsx`). Si viene de la caché aparece de una, así que
    volver a Clima no repite la animación.
  - Buscar: al marcar la estrella, la fila viaja a "Guardados"
    (`document.startViewTransition` y `flushSync`).
  - Diálogos y `details` animados solo con CSS; sin soporte, cambian de golpe.
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
  - El service worker es propio: `src/sw.ts`, armado por vite-plugin-pwa con
    `strategies: 'injectManifest'` (el plugin solo inyecta la lista del precache; los
    patrones del app shell siguen en `vite.config.ts`, bloque `injectManifest`).
    Precachea el app shell y las fuentes, y toda navegación que no sea `/api/` cae en
    `index.html`.
  - Usa network-first para `/api/lotes/` (caché `api-lotes`, privado) y para
    `/api/pronostico/`, `/api/lugares/` y `/api/planes/` (caché `api-publico`, por URL).
    Nunca cachea `/api/auth/` ni `/api/alertas/`.
  - También recibe los avisos push (S7): muestra la notificación con el JSON
    `{title, body, url, tag}` (sin JSON, título "Gaucho Weather" y el texto como cuerpo) y
    al tocarla enfoca la app abierta y la lleva a `url`, o abre una ventana nueva; por
    defecto `/alertas`, y solo URLs del mismo origen.
  - Una versión nueva espera a que se cierren las pestañas (o a un mensaje
    `SKIP_WAITING`): igual que el worker generado de antes, que con `injectRegister: false`
    nunca tuvo `skipWaiting` ni `clientsClaim`.
  - El pronóstico público también se persiste en IndexedDB (raíz `pronostico`), así
    Inicio abre sin señal con el último lugar.
  - Cuando responde desde su caché agrega el header `X-From-SW-Cache: 1` (plugin
    `cachedResponseWillBeUsed` en `src/sw.ts`); la app lo trata como "sin conexión".
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
- **Mapa del lote (S7):** MapLibre GL en `src/components/MapPicker.tsx`, un chunk aparte
  que se carga solo al agregar o editar un lote. La lógica vive en
  `src/components/LocationField.tsx` y `src/lib/outline.ts`; el mapa solo dibuja y avisa
  toques.
  - **Búsqueda:** "Buscar localidad o paraje" usa `/api/lugares/?q=` (Georef) con el
    mismo debounce de Buscar (`src/hooks/useDebounced.ts`). Elegir un lugar vuela el
    mapa a zoom 13 en satélite (Sentinel-2 se ve mejor dos niveles debajo de su límite)
    y 14 en calles; Enter elige el primero y nunca envía el formulario.
  - **Capas:** abre en satélite y el botón "Calles" cambia a OpenFreeMap. El cambio de
    estilo borra las capas propias, así que `style.load` vuelve a poner el contorno.
  - **Contorno:** con "Dibujar contorno" cada toque suma una esquina. Se cierra tocando
    la primera esquina (crece con un anillo desde la tercera) o con "Cerrar contorno".
    Las esquinas se arrastran; los puntos chicos entre esquinas suman una (toque o
    arrastre); tocar una esquina la marca para "Quitar esquina". Hay "Deshacer"
    (saca la última esquina, o reabre si lo último fue cerrar), "Borrar contorno" y
    "Esquina en la mira", que suma la esquina en la cruz del centro: sirve para teclado
    y para precisión con el dedo. Los objetivos táctiles miden 44 px.
  - **Hectáreas:** área geodésica en vivo (fórmula de Chamberlain y Duquette sobre la
    esfera WGS84, la misma de `@turf/area`). Al cerrar, llena "Hectáreas" con 2
    decimales; si el productor la corrige a mano, se respeta hasta que mueva el contorno.
  - **Guardado:** `boundary` es un `Polygon` GeoJSON con el anillo cerrado y 6 decimales.
    Sin punto marcado, la latitud y longitud son el centroide del contorno. Un contorno
    abierto no se guarda: pide cerrarlo.
  - Siguen el botón "Usar mi ubicación", "Marcar punto" y los campos de latitud y
    longitud.
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
- **Decisión (2026-11-16):** service worker propio con `injectManifest` en vez de
  `generateSW`.
  **Por qué:** Web Push necesita los eventos `push` y `notificationclick`, y el worker
  generado no los admite. Las rutas, cachés, plugins y el precache se copiaron uno a uno;
  se comparó el `sw.js` de antes y después (mismas 19 entradas del precache, mismas
  rutas, estrategias y cachés) y se probó en Chrome sin red.
  **Alternativas descartadas:** `importScripts` con un archivo suelto dentro de
  `generateSW`: queda fuera de TypeScript y del bundle, y las rutas seguirían repartidas.
  **Tipos:** `src/sw.ts` se chequea con la lib WebWorker en `tsconfig.sw.json`; la app
  sigue con DOM en `tsconfig.app.json`, y `tsconfig.json` solo referencia a los dos.
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

- **Decisión:** satélite por defecto EOxCloudless 2016 (Sentinel-2, 10 m), sin API key.
  **Por qué:** es la única capa satelital sin key que permite uso comercial y cubre la
  Argentina. Licencia por capa en el `WMTSCapabilities.xml` de EOX
  (https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml): 2016 y 2017 son
  CC BY 4.0, 2018 en adelante CC BY-NC-SA 4.0 (comercial solo con licencia de EOX,
  https://cloudless.eox.at/documentation/license). La de 2017 no tiene datos fuera de
  Europa: en la Argentina devuelve teselas vacías y el mapa queda en blanco.
  Atribución obligatoria: "EOxCloudless 2016 by EOX IT Services GmbH (Contains modified
  Copernicus Sentinel data 2016), CC BY 4.0", en el botón (i) del mapa.
  **Límite:** 10 m por píxel; desde zoom 15 la imagen se estira. Alcanza para ver
  alambrados y caminos de lotes grandes, no para detalles chicos, y es de 2016.
  **Alternativas descartadas:** Esri World Imagery por la URL pública anónima (más
  nítida, pero esa URL no permite uso comercial; el camino comercial es una cuenta de
  ArcGIS Location Platform con API key: 2M teselas/mes gratis y después USD 0,15 cada
  1000, https://location.arcgis.com/pricing/, con plugin oficial para MapLibre,
  https://developers.arcgis.com/maplibre-gl-js/; pendiente de decisión del usuario;
  https://goto.arcgis.com/maps/World_Imagery y
  https://community.esri.com/t5/arcgis-location-platform-developers-ques/inquiry-about-world-imagery/m-p/1569266)
  y MapTiler Satellite (pide key). Se pueden enchufar sin tocar código con
  `VITE_SATELLITE_TILES_URL` (plantilla XYZ `{z}/{x}/{y}`), `VITE_SATELLITE_ATTRIBUTION`
  y `VITE_SATELLITE_MAX_ZOOM` en el build (`frontend/Dockerfile` los recibe como
  `ARG`, y `docker-compose.prod.yml` se los pasa desde el `.env`), siempre con su
  licencia y su atribución.
- **Decisión (2026-11-04):** el mapa no deja acercarse más de un nivel por encima del
  zoom máximo de la imagen satelital (16 con EOX); con el mapa de calles sigue en 18.
  **Por qué:** pasado el máximo de la fuente, MapLibre solo estira la tesela y el
  usuario veía la imagen borrosa al hacer zoom ("al hacer zoom no se ve bien").
- **Decisión (2026-11-04):** nombres de localidades y rutas encima del satélite, con
  las teselas vectoriales de OpenFreeMap (capas `place` y `transportation_name`), en
  blanco con halo oscuro.
  **Por qué:** pedido del usuario ("tampoco dice el nombre de las localidades"). Es la
  misma fuente del mapa de calles: sin key y con uso comercial permitido (ODbL, con
  atribución en el botón (i)).
- **Decisión (2026-11-04):** controles del mapa de 44 px, botón "mi ubicación" (GPS) y
  pantalla completa para dibujar el lote. En iPhone, donde no existe la API de pantalla
  completa, MapLibre llena la ventana.
  **Por qué:** "debe ser útil en dispositivos móviles": el productor está en el lote,
  con una mano y a pleno sol.
- **Decisión:** calles con OpenFreeMap "liberty" (datos OpenStreetMap, ODbL).
  **Por qué:** sin key y de uso libre, también comercial, con atribución
  (https://openfreemap.org/).
- **Decisión:** el worker de MapLibre se arma con Vite (`?worker&url`) y se registra con
  `setWorkerUrl`.
  **Por qué:** MapLibre 6 busca `maplibre-gl-worker.mjs` al lado de su propio módulo.
  Vite lo pre-empaqueta en `.vite/deps` (dev) y en un chunk con hash (build), donde ese
  archivo no existe: el worker no cargaba y el mapa no mostraba ninguna tesela ("el mapa
  no funciona ni se visualiza", 2026-11-04). Además nginx 1.29 sirve `.mjs` como
  `application/octet-stream`, y un worker módulo así no arranca; Vite lo emite como
  `.js`. El worker queda fuera del precache, igual que el chunk del mapa.
- **Decisión:** la regla de tamaño del mapa es `.map-frame > .map-canvas`.
  **Por qué:** `maplibre-gl.css` llega con el chunk del mapa, después de `app.css`, y su
  `.maplibregl-map { position: relative }` le ganaba a `.map-canvas` por orden: el mapa
  quedaba con 0 px de alto. Con dos clases la regla propia pesa más.

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
- **Mapa:** `src/lib/outline.ts` (área, centroide, GeoJSON y estados del dibujo) tiene
  sus tests en `outline.test.ts`. `src/test/loteForm.test.tsx` reemplaza el mapa por un
  doble que guarda sus props para tocar el mapa, mover esquinas y leer adónde vuela.
  `src/components/MapPicker.test.tsx` vigila los dos errores del mapa en blanco (worker
  y peso de la regla CSS); jsdom no aplica especificidad, así que la prueba real es un
  Chrome con WebGL (`--use-angle=swiftshader --enable-unsafe-swiftshader`).
- **Service worker:** una ruta o caché nueva va en `src/sw.ts`. Si se renombra
  `api-lotes` o `api-publico`, o el header `X-From-SW-Cache`, hay que cambiar también
  `src/query/session.ts` y `src/api/client.ts`. Ningún test cubre el worker: después de
  tocarlo, compará el `dist/sw.js` del build y probalo sin red en el navegador.
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
- 2026-11-04: mapa interactivo del lote (T4, S7): búsqueda de localidad o paraje,
  satélite EOxCloudless 2016 con cambio a calles, dibujo del contorno con hectáreas
  automáticas y centroide como ubicación. Arreglo del mapa en blanco: worker de MapLibre
  sin URL válida y contenedor de 0 px por el orden del CSS.
- 2026-11-16: service worker propio (`src/sw.ts`, `injectManifest`) con los mismos cachés
  y rutas, más `/api/planes/` en el caché público, `/api/alertas/` sin caché y los
  eventos de Web Push (T9, S7).
- 2026-11-17: lugares guardados con estrella en Buscar; cierra el pendiente de S8 de
  clima-y-fileteado.
- 2026-11-17: cielo animado según el clima de esta hora, con pausa y presupuesto de
  contraste; el cuerpo de la página pasa a ser transparente para que se vea el campo
  del cielo (feature `cielo-animado`).
- 2026-11-17: barra de pestañas de vidrio líquido y pasada de motion: lente que viaja,
  entrada del pronóstico, diálogos y acordeones (feature `motion-pass`).
