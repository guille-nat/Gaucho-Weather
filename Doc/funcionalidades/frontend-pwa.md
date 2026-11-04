# Frontend PWA
> Última actualización: 2026-11-03

## Qué hace
App web instalable (PWA), mobile first, para el productor: ingresar o crear cuenta,
ver sus lotes con la mínima pronosticada para esta noche, agregar, editar y borrar
lotes con ubicación en el mapa o por GPS, y seguir viendo los últimos datos sin señal.
Fase 1 no tiene motor de decisiones: no muestra veredictos de helada.

## Cómo funciona
- **Stack:** Vite + React + TypeScript estricto, React Router, TanStack Query, pnpm.
  Código en `frontend/`.
- **Pantallas** (`frontend/src/pages/`):
  - `/ingresar` y `/crear-cuenta`.
  - `/` Mis lotes, con estado vacío para usuarios nuevos.
  - `/lotes/nuevo`, `/lotes/:id` y `/lotes/:id/editar`.
  - `/alertas`: aviso de que llegan en una próxima versión.
  - `/perfil`, con el botón Salir.
- **API** (`src/api/client.ts`): `fetch` same-origin con la cookie de sesión de Django.
  - Pide `GET /api/auth/csrf/` una vez y manda `X-CSRFToken` en POST, PATCH y DELETE.
  - Lee la cookie en cada pedido, porque Django la rota al ingresar.
  - Ante un 403 de CSRF pide un token nuevo y reintenta una sola vez.
  - Un 403 en `/api/auth/me/` significa "anónimo" y el guard manda a `/ingresar`.
- **Sin señal:**
  - TanStack Query guarda el usuario y los lotes en IndexedDB (`src/query/persister.ts`),
    hasta 7 días.
  - Sin conexión se muestra lo último guardado con "Sin conexión · datos de las HH:MM",
    en hora argentina.
  - El service worker (vite-plugin-pwa / Workbox) precachea el app shell y las fuentes.
  - Usa network-first para `/api/lotes/` y nunca cachea `/api/auth/`.
- **Mapa:** MapLibre GL con teselas de OpenFreeMap, sin API key.
  - Se carga en un chunk aparte (`src/components/MapPicker.tsx`) solo al agregar o
    editar un lote.
  - Hay botón "Usar mi ubicación" y campos de latitud y longitud.
- **Diseño:** mezcla de "canon" (app de campo familiar) y "plano catastral", elegida por
  el usuario.
  - El contrato está en `.impeccable/surfaces/frontend-src-pages-mislotes-tsx.md`.
  - La firma es `ParcelOutline`: el contorno del lote, con su número y el norte.
  - Usa `boundary` si existe; si no, un cuadrilátero fijo por id.
  - El rayado (`severity`) tiene las variantes `critical`, `caution`, `ok` y `none`.
    En Fase 1 todo usa `none`.
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
- **Decisión:** fuentes self-hosted con @fontsource (Atkinson Hyperlegible Next y Barlow
  Semi Condensed), solo el subset latin.
  **Por qué:** tienen que funcionar sin conexión, y el subset latin alcanza para el
  castellano.
- **Decisión:** las horas se muestran en `America/Argentina/Buenos_Aires`, sin importar
  la zona del dispositivo.
  **Por qué:** el producto es de la zona núcleo, y así los tests son deterministas.
- **Decisión:** la mínima se muestra como "pronóstico, no es todavía un aviso de helada",
  con el valor de cada modelo.
  **Por qué:** en Fase 1 no hay motor de decisiones y no se inventan veredictos.
- **Decisión:** la barra inferior tiene Lotes, Alertas y Perfil, sin Pronóstico.
  **Por qué:** en Fase 1 no hay pantalla de pronóstico, y una pestaña vacía confunde.
  (sin confirmar con el usuario)
- **Decisión:** el modo mock (`pnpm dev:mock`) responde `/api/` dentro de la página con
  los mismos handlers MSW de los tests, sin service worker.
  **Por qué:** permite ver la app y sacar capturas sin backend, también en Chrome headless.

## Cómo modificarlo
- **Contrato de la API:** los tipos están en `src/api/types.ts` y el mock en
  `src/mocks/handlers.ts`.
  - Si cambia el contrato S8, actualizá los dos.
  - Si cambia la forma de lo que se persiste, subí `PERSIST_BUSTER` en
    `src/query/persister.ts`.
- **Fase 2 (veredictos):** pasá `severity` a `ParcelOutline` y usá `StatusChip` con su
  tono. Los dos componentes ya están listos.
- **Tests** (`src/test/`, Vitest + Testing Library + MSW): login, registro, guard,
  CSRF, lista, estado vacío, datos offline, validación del formulario y resumen.
  Ejecutalos con `pnpm test`.
- **Proxy de desarrollo:** `VITE_API_PROXY_TARGET`. Por defecto es
  `http://localhost:8001`; en compose es `http://backend:8000`.

## Historial
- 2026-11-03: primera versión (Fase 1, T5).
