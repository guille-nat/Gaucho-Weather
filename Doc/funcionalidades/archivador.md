# Archivador de pronósticos y observaciones
> Última actualización: 2026-11-26

## Qué hace
Guarda desde la Fase 1 los pronósticos de Open-Meteo y las observaciones
horarias del SMN, para el backtesting y la calibración. Ningún proveedor
conserva los miembros del ensemble, así que si no se guardan, se pierden.

## Cómo funciona
- App `backend/apps/archiver/`. Tareas Celery en `tasks.py`, programadas con
  beat (hora argentina):
  - `archiver.fetch_forecasts`, cada hora en punto. Cada turno de 6 h (00, 06,
    12 y 18) se baja una sola vez: la corrida solo pide los modelos de cada celda
    que todavía no tienen un snapshot desde el inicio del turno
    (`forecast_slot_start`). En marcha normal descarga a las 00, 06, 12 y 18, y
    las demás horas no piden nada.
  - `archiver.fetch_smn_observations`, cada hora a las y 10.
  - `archiver.fetch_history`, cada hora a las y 20: clima pasado de cada celda
    con lotes. Ver [historico.md](historico.md).
  - `archiver.backfill_history`, sin agenda: se encola al crear o mover un lote
    y carga 90 días de su celda.
- Si guardó algo, `fetch_forecasts` encola `alerts.evaluate_rules`, que evalúa las
  reglas de alerta con los pronósticos nuevos (ver [alertas.md](alertas.md)). Si
  el broker está caído lo registra y la corrida sigue.
- **Pronósticos** (`ForecastSnapshot`):
  - Celdas: coordenadas de cada lote redondeadas a 0,1°, más las estaciones
    del SMN Rosario Aero (87480), Venado Tuerto Aero (87468) y Marcos Juárez
    Aero (87467), definidas en `stations.py`.
  - Por celda, un pedido por modelo: determinísticos `ecmwf_ifs025`,
    `gfs_seamless` e `icon_seamless`, y ensembles `ecmwf_ifs025` y `gfs025`.
  - 7 días, variables horarias de `reglas-agronomicas.md` (sección 7), más
    `weather_code` para el cielo del día. Se listan en `openmeteo.py`.
  - Los determinísticos piden además `past_days=7` (la lluvia caída) y
    `daily=sunrise,sunset`. Los ensembles no, porque solo dan la probabilidad
    de lluvia.
  - Se guarda la respuesta cruda en JSONB, con modelo, tipo y `fetched_at`.
    Hay una fila única por celda, modelo, tipo y hora de descarga.
- **Observaciones** (`Observation`):
  - Se descarga `datohorario<AAAAMMDD>.txt` de
    `https://ssl.smn.gob.ar/dpd/descarga_opendata.php?file=observaciones/...`.
  - Se guardan solo las filas de las tres estaciones, con la línea original.
    Hay una fila única por estación y hora.
  - El parser (`smn.py`) lee columnas de ancho fijo en Latin-1. Las columnas
    vacías quedan en null y se saltean los nombres largos partidos en dos líneas.
- **A demanda:** el [pronóstico público](pronostico.md) también guarda. Cuando
  una celda no tiene un determinístico de menos de 3 h, pide los tres
  determinísticos y los guarda con `archive_cell(client, cell, jobs, now)`, la
  misma función que usa la tarea por cada celda. La fila única por hora la
  mantiene idempotente; los ensembles quedan solo para la tarea.
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

- **Decisión:** `past_days` y `daily` solo en los determinísticos.
  **Por qué:** el [pronóstico](pronostico.md) toma la lluvia caída y el sol de
  un determinístico. En un ensemble cada variable se multiplica por ~50
  miembros, y no hacen falta.

- **Decisión:** la descarga de una celda vive en `archive_cell` y la usan la
  tarea y el pronóstico público.
  **Por qué:** un solo camino idempotente; si cambian las variables o la regla
  de una fila por hora, cambia para los dos.

- **Decisión:** `fetch_forecasts` corre cada hora y baja solo lo que le falta al
  turno de 6 h (2026-11-26; reemplaza al `crontab` de cada 6 h).
  **Por qué:** beat no recupera corridas perdidas. Con el stack apagado (la PC de
  dev de noche, un corte o un deploy en prod) el pronóstico quedaba viejo hasta
  6 h después de volver: el 2026-11-20 el tablero del lote mostró uno de 20 h. Y
  un modelo que fallaba (un 429 de Open-Meteo en los ensembles) esperaba al
  turno siguiente. Ahora los dos casos se recuperan en la próxima hora, sin
  pedidos extra en marcha normal. Las alertas no evalúan pronósticos de más de
  `ALERTS_MAX_FORECAST_AGE_HOURS`, así que un hueco largo también las apagaba.
  **Alternativas descartadas:** correr la descarga al arrancar el worker solo en
  dev (no cubre los cortes en prod ni los 429); bajar todo cada hora (6 veces
  más pedidos y espacio sin datos nuevos, porque los modelos salen cada 6 h).

## Cómo modificarlo
- **Espacio en disco** (medido el 2026-11-03, ya comprimido por Postgres): un
  ensemble ECMWF ocupa ~265 kB, uno GFS ~132 kB y cada determinístico ~10 kB.
  Son ~425 kB por celda y corrida, ~1,7 MB por celda y día, y unos 6 GB por año
  con 10 celdas. Revisarlo cuando crezcan los lotes. Con `past_days=7` cada
  determinístico pasa de 168 a 336 horas (~2 veces más), pero son una parte
  chica del total.
- Agregar una estación: sumarla a `STATIONS` con el nombre exacto del archivo
  del SMN.
- Correr a mano: `docker compose exec backend python manage.py shell -c
  "from apps.archiver.tasks import fetch_forecasts; fetch_forecasts()"`.
- Tests: `backend/tests/test_archiver_forecasts.py` y `test_archiver_smn.py`. El
  fixture `tests/fixtures/datohorario20261102.txt` tiene líneas reales del SMN
  (CC BY 2.5 AR).

## Historial
- 2026-11-03: versión inicial (Fase 1).
- 2026-11-03: `past_days=7`, `daily=sunrise,sunset` y `weather_code` en los
  determinísticos, para el pronóstico del lote (feature `clima-y-fileteado`).
- 2026-11-03: `archive_cell` extraída de la tarea para reusarla en la descarga
  a demanda del pronóstico público (T5).
- 2026-11-26: `fetch_forecasts` pasa a correr cada hora y baja solo lo que le falta
  al turno de 6 h; una corrida que no guarda nada no evalúa alertas. Un turno
  perdido o un modelo fallido se recupera en la próxima hora.
- 2026-11-16: tareas `fetch_history` y `backfill_history` con la tabla
  `WeatherHour`, y la evaluación de alertas al final de `fetch_forecasts`
  (feature `cuenta-planes-alertas`).
- 2026-11-20: el pronóstico del lote expone la dirección del viento por hora (feature
  `lote-tablero` S1). No hizo falta migración: `wind_direction_10m` ya se pedía y quedaba
  guardada en el `payload` de cada `ForecastSnapshot`, así que los snapshots viejos
  también la traen.

- 2026-11-16 — Los logs de los pedidos fallidos a Open-Meteo muestran sólo el código HTTP (`openmeteo.describe_error`), y los loggers `httpx`/`httpcore` quedan en WARNING: las URLs llevan la `apikey` comercial y no deben aparecer en los logs. Editar un lote sin moverlo ya no vuelve a pedir su pronóstico ni su historial.
