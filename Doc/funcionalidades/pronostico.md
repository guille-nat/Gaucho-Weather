# Pronóstico (del lote y público)
> Última actualización: 2026-11-03

## Qué hace
`GET /api/lotes/{id}/pronostico/` devuelve lo que el productor necesita para
decidir en su lote: ahora, hoy, lluvia caída en 7 días, 7 días, 48 horas y las
decisiones del [motor v0](motor-decisiones.md). Solo lee el archivo: nunca
llama a Open-Meteo al responder.

También existe el **pronóstico público** `GET /api/pronostico/?lat=&lon=`
(S10): el mismo cuerpo para cualquier punto de Argentina, sin cuenta, más
`place`. Ese sí puede llamar a Open-Meteo cuando el archivo está viejo (ver más
abajo).

## Cómo funciona
- Vista: acción `pronostico` de `LoteViewSet` (`backend/apps/lotes/views.py`).
  Un lote ajeno da 404. Sin pronósticos determinísticos archivados para la
  celda responde 404 con `{"detail": "Todavía no hay pronóstico para este lote."}`.
- Armado: `backend/apps/archiver/forecast.py`.
  - `latest_archives(cells)`: el último snapshot de cada modelo y celda en dos
    consultas. De los ensembles trae solo `time` y las claves de
    `precipitation` (con SQL sobre el JSONB), porque los miembros los hacen ~50
    veces más grandes.
  - Valores: mediana entre los determinísticos (`ecmwf_ifs025`, `gfs_seamless`,
    `icon_seamless`). Los diarios se calculan por modelo y después se toma la
    mediana. La dirección del viento es una media circular.
  - Probabilidad de lluvia: fracción de miembros con ≥ 1 mm en el día o la hora,
    promediada entre los ensembles con pesos iguales. Es null sin ensembles.
  - `rain_past_7d_mm`: suma de las 168 h anteriores del primer modelo que las
    cubre, en el orden ECMWF, GFS, ICON.
  - `today.sunrise` y `sunset` salen del bloque `daily` del mismo orden de modelos.
  - Horas en ISO 8601 con el offset de America/Argentina/Buenos_Aires.
- Respuesta (contrato S5):

  ```
  {fetched_at, models: [str],
   now: {time, temperature_c, humidity_pct, wind_kmh, wind_dir_deg, gust_kmh,
         sky, cloud_cover_pct, rain_mm},
   today: {max_c, min_c, sunrise, sunset},
   rain_past_7d_mm,
   daily: [{date, max_c, min_c, rain_mm, rain_probability_pct, sky}] (7),
   hourly: [{time, temperature_c, humidity_pct, wind_kmh, gust_kmh, rain_mm,
             rain_probability_pct, sky, cloud_cover_pct}] (48),
   decisions: {frost_tonight, spray_today, field_work, engine_version, validated}}
  ```
- **Cielo de cada hora** (`now.sky`, `hourly[].sky`): alimenta el fondo animado. Las
  reglas son las del cielo del día, con un umbral de lluvia propio de una hora:
  - es `tormenta` si la mayoría de los modelos trae un código WMO 95, 96 o 99 en esa hora;
  - es `lluvia` si la mediana de la precipitación de la hora llega a 0,2 mm
    (`SKY_RAIN_HOUR_MM`). El umbral es el doble de la resolución de 0,1 mm de los
    modelos, para que una traza no se pinte como lluvia;
  - si no, decide la nubosidad: menos de 30 % es `sol`, menos de 70 % es `parcial` y
    el resto `nublado`. Sin dato de nubes, `parcial`.
  - `cloud_cover_pct` es la mediana entre modelos.

### Pronóstico público (S8, S10)
- Vista: `PublicForecastView` en `backend/apps/weather/views.py`; la lógica, en
  `backend/apps/weather/ondemand.py`.
- Público (`AllowAny`, sin sesión, así que no pide CSRF) y con throttle por IP
  (`IPScopedRateThrottle`, scope `public_forecast`, `THROTTLE_PUBLIC_FORECAST_RATE`,
  60/hora por defecto).
- Errores:
  - `lat`/`lon` faltantes o no numéricos: 400
    `{"detail": "Indicá lat y lon como números."}`.
  - Fuera de los límites de Argentina de la Fase 1 (latitud −56 a −21,
    longitud −74 a −53, en `apps/archiver/cells.py`): 400
    `{"detail": "Por ahora solo cubrimos Argentina."}`.
  - Sin archivo y sin red: 503
    `{"detail": "No pudimos obtener el pronóstico. Probá en un rato."}`.
- Flujo:
  1. Se calcula la celda de 0,1° (`grid_cell`).
  2. Si el último determinístico archivado de la celda tiene menos de 3 h, se
     arma la respuesta desde el archivo.
  3. Si no, se piden ya los tres determinísticos a Open-Meteo y se guardan con
     `archive_cell` (`apps/archiver/tasks.py`), el mismo camino idempotente que
     la tarea programada. Así cada búsqueda también suma al backtesting.
  4. Si Open-Meteo falla, se sirve el último snapshot más viejo que haya; si no
     hay ninguno, 503.
  5. El cuerpo es el de S5 (`build_forecast`) más
     `place: {name, region}|null`, del [reverso de lugares](lugares.md). Si
     Georef falla, `place` es null y el pronóstico igual responde.
- **Concurrencia:** un lock en la caché (`cache.add`, `SET NX` en Redis) por
  celda, de 60 s. Si otro pedido ya está descargando esa celda, se espera hasta
  20 s a que termine y se lee el archivo, sin volver a pedir.

## Decisiones y por qué
- **Decisión:** el pronóstico público pide solo los determinísticos; los
  ensembles quedan para la tarea programada.
  **Por qué:** un ensemble es ~50 veces más grande y más lento (los miembros),
  lo que haría lenta la respuesta, y en Open-Meteo los ensembles requieren el
  plan Professional para uso comercial (<https://open-meteo.com/en/pricing>).
  Una celda nueva tiene `rain_probability_pct` null hasta que se archive un
  ensemble (hoy solo pasa en celdas de lotes y estaciones).
  **Alternativas descartadas:** pedir ensembles también; se puede sumar si el
  plan contratado los incluye.
- **Decisión:** las celdas pedidas por el público no se suman a la tarea
  programada.
  **Por qué:** cualquier búsqueda crearía una celda más para descargar cada 6 h,
  sin límite. Solo se archiva lo que alguien pidió.
- **Decisión:** 3 h de frescura y timeouts de 8 s por pedido (4 s de conexión).
  **Por qué:** la tarea corre cada 6 h; 3 h es lo que pide S10. Los tres
  pedidos entran en los 30 s de timeout del worker de gunicorn.
- **Decisión:** 60 pedidos por hora por IP.
  **Por qué:** cada celda vieja cuesta ~7 llamadas de Open-Meteo (24 variables y
  14 días cuentan como 2,4 llamadas por pedido, según su página de precios), y
  el plan gratuito permite 10.000 por día.
- **Decisión:** mediana entre modelos para los valores.
  **Por qué:** resiste a un modelo que se dispara; con tres modelos es el del medio.
- **Decisión:** `models` lista solo los determinísticos usados para los valores.
  **Por qué:** son la fuente de lo que se muestra; los ensembles solo dan la
  probabilidad.
- **Decisión:** ECMWF primero para la lluvia caída y el sol.
  **Por qué:** (sin confirmar) suele ser el global con mejor desempeño; falta
  medirlo en la zona.
- **Decisión:** `models_agreeing` es el texto `"N de M modelos"`.
  **Por qué:** así lo pide el contrato (S4) y se muestra tal cual.

## Cómo modificarlo
- Si cambian las variables del archivador, revisar `VARIABLES` en
  `forecast.py`.
- Los snapshots archivados antes del 2026-11-03 no tienen `past_days` ni
  `daily`: `rain_past_7d_mm`, `sunrise` y `sunset` salen null hasta la próxima
  descarga, y la pulverización dice que faltan datos.
- Tests: `backend/tests/test_pronostico.py` (lote) y
  `backend/tests/test_public_forecast.py` (público, con Open-Meteo y Georef
  simulados con respx).
- El lock y los tiempos de espera son constantes de `ondemand.py`
  (`FRESH_FOR`, `LOCK_TTL_SECONDS`, `LOCK_WAIT_SECONDS`, `HTTP_TIMEOUT`).

## Historial
- 2026-11-03: versión inicial (feature `clima-y-fileteado`).
- 2026-11-03: pronóstico público `GET /api/pronostico/?lat=&lon=` con descarga
  a demanda y `place` (S8, S10, T5). El del lote no cambia.
- 2026-11-17: `sky` y `cloud_cover_pct` por hora, y `now.rain_mm`, para el fondo
  animado (feature `cielo-animado`). Son campos agregados; nadie que ya consuma la
  API se rompe.
