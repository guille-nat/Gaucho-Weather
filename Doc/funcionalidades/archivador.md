# Archivador de pronósticos y observaciones
> Última actualización: 2026-11-03

## Qué hace
Guarda desde la Fase 1 los pronósticos de Open-Meteo y las observaciones
horarias del SMN, para el backtesting y la calibración. Ningún proveedor
conserva los miembros del ensemble, así que si no se guardan, se pierden.

## Cómo funciona
- App `backend/apps/archiver/`. Tareas Celery en `tasks.py`, programadas con
  beat (hora argentina):
  - `archiver.fetch_forecasts`, cada 6 h (00, 06, 12 y 18).
  - `archiver.fetch_smn_observations`, todos los días a las 03:00.
- **Pronósticos** (`ForecastSnapshot`):
  - Celdas: coordenadas de cada lote redondeadas a 0,1°, más las estaciones
    del SMN Rosario Aero (87480), Venado Tuerto Aero (87468) y Marcos Juárez
    Aero (87467), definidas en `stations.py`.
  - Por celda, un pedido por modelo: determinísticos `ecmwf_ifs025`,
    `gfs_seamless` e `icon_seamless`, y ensembles `ecmwf_ifs025` y `gfs025`.
  - 7 días, variables horarias de `reglas-agronomicas.md` (sección 7). Se
    listan en `openmeteo.py`.
  - Se guarda la respuesta cruda en JSONB, con modelo, tipo y `fetched_at`.
    Hay una fila única por celda, modelo, tipo y hora de descarga.
- **Observaciones** (`Observation`):
  - Se descarga `datohorario<AAAAMMDD>.txt` de
    `https://ssl.smn.gob.ar/dpd/descarga_opendata.php?file=observaciones/...`.
  - Se guardan solo las filas de las tres estaciones, con la línea original.
    Hay una fila única por estación y hora.
  - El parser (`smn.py`) lee columnas de ancho fijo en Latin-1. Las columnas
    vacías quedan en null y se saltean los nombres largos partidos en dos líneas.
- **Fallas:** un error de red, HTTP o JSON se registra en el log y se sigue con
  el resto. La tarea no lanza excepciones, y como es idempotente, la próxima
  corrida completa lo que faltó.

## Decisiones y por qué
- **Decisión:** un pedido por modelo en vez de uno con varios modelos.
  **Por qué:** cada fila guarda la respuesta cruda de un solo modelo, sin
  sufijos en las claves.
- **Decisión:** cada corrida del SMN relee los últimos `SMN_LOOKBACK_DAYS` días (3).
  **Por qué:** si un día falla, la corrida siguiente lo recupera. La restricción
  única evita duplicados.
- **Decisión:** el SMN responde 200 con el texto "El archivo no existe." cuando
  falta el archivo, y se trata como falla.
  **Por qué:** comportamiento observado en el servidor del SMN el 2026-11-03.
- **Decisión:** plan gratuito de Open-Meteo por ahora.
  **Por qué:** el desarrollo y el backtesting son "evaluation and prototyping".
  Para el lanzamiento comercial hace falta un plan pago (Standard en la beta,
  ver `plan-reescritura.md`). Se cambia con `OPEN_METEO_FORECAST_URL`,
  `OPEN_METEO_ENSEMBLE_URL` y `OPEN_METEO_API_KEY`, sin tocar código. El plan
  Standard no incluye ensembles.

## Cómo modificarlo
- **Espacio en disco** (medido el 2026-11-03, ya comprimido por Postgres): un
  ensemble ECMWF ocupa ~265 kB, uno GFS ~132 kB y cada determinístico ~10 kB.
  Son ~425 kB por celda y corrida, ~1,7 MB por celda y día, y unos 6 GB por año
  con 10 celdas. Revisarlo cuando crezcan los lotes.
- Agregar una estación: sumarla a `STATIONS` con el nombre exacto del archivo
  del SMN.
- Correr a mano: `docker compose exec backend python manage.py shell -c
  "from apps.archiver.tasks import fetch_forecasts; fetch_forecasts()"`.
- Tests: `backend/tests/test_archiver_forecasts.py` y `test_archiver_smn.py`. El
  fixture `tests/fixtures/datohorario20261102.txt` tiene líneas reales del SMN
  (CC BY 2.5 AR).

## Historial
- 2026-11-03: versión inicial (Fase 1).
