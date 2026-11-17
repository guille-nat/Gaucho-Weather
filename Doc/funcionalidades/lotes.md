# Lotes
> Última actualización: 2026-11-17

## Qué hace
Cada usuario carga sus lotes con su ubicación exacta. Superficie, contorno y
cultivos son opcionales; un lote puede tener varios cultivos, cada uno con sus
hectáreas y su fecha de siembra. Cada lote muestra la mínima pronosticada
para esta noche y un titular con la decisión más urgente. El detalle del
pronóstico está en [pronostico.md](pronostico.md).

## Cómo funciona
- App `backend/apps/lotes/`, modelo `Lote`, endpoints `/api/lotes/` (GET lista
  ordenada por nombre, POST) y `/api/lotes/{id}/` (GET, PATCH, DELETE).
- Cada usuario ve solo sus lotes: el de otro responde 404.
- Validaciones: latitud −56 a −21, longitud −74 a −53 (Argentina), nombre de
  hasta 80 caracteres y `boundary` como `Polygon` GeoJSON con anillos cerrados.
- Las coordenadas se guardan con 6 decimales; si llegan más, se redondean.
- Los decimales del lote (`latitude`, `longitude`, `area_ha`) salen como números
  JSON; el `area_ha` de cada cultivo sale como texto (`"12.50"`), como fija el
  contrato de `plantings`.
- Cultivos: modelo `Planting` (tabla `lotes_planting`, `related_name="plantings"`,
  se borra con el lote). El lote ya no tiene `crop` ni `sowing_date`.

  ```json
  "plantings": [
    {"id": 7, "crop": "soja", "area_ha": "12.50", "sowing_date": "2026-10-01"},
    {"id": 8, "crop": "maiz", "area_ha": null, "sowing_date": null}
  ]
  ```

  - Se leen ordenados por `id`; un lote sin cultivos devuelve `[]`.
  - `crop` es obligatorio y va en `soja`, `maiz`, `trigo`, `girasol`, `cebada`,
    `sorgo` u `otro` (`""` o null se rechazan). `area_ha` es opcional y mayor
    que 0 (se redondea a 2 decimales, como la superficie del lote). `sowing_date`
    es opcional.
  - Al escribir (POST o PATCH) se manda la lista completa, sin `id`, y reemplaza
    a la anterior dentro de una transacción. En un PATCH, si falta `plantings`,
    los cultivos no cambian; en un POST, si falta, el lote queda sin cultivos.
  - Hasta 8 cultivos: más devuelve `{"plantings": ["Hasta 8 cultivos por lote."]}`.
  - Los errores por cultivo van en una lista con una entrada por cultivo enviado,
    `{}` para los válidos: `{"plantings": [{}, {"crop": ["…"]}]}`.
  - El mismo cultivo puede repetirse (dos siembras en el mismo lote).
  - La lista de lotes trae los cultivos de todos los lotes en una sola consulta
    (`prefetch_related_objects` en `LoteListSerializer`).
- `summary` (solo lectura) sale de `backend/apps/archiver/summary.py`:

  ```json
  {"tonight_min_c_2m": 3.1,
   "tonight_min_models": {"ecmwf_ifs025": 3.1, "gfs_seamless": 4.0, "icon_seamless": 3.5},
   "fetched_at": "2026-11-03T21:41:28-03:00",
   "headline": {"level": "critical", "text": "Helada esta noche: en el suelo puede bajar a −3 °C."}}
  ```

  - Usa el último pronóstico determinístico archivado de cada modelo para la
    celda de 0,1° del lote.
  - "Esta noche" es de 20:00 a 08:00, hora argentina. Antes de las 08:00 es la
    noche en curso.
  - `tonight_min_c_2m` es el mínimo entre modelos. Es null si ningún modelo
    trae horas en esa ventana, y `summary` es null si la celda todavía no tiene
    pronósticos.
  - `headline` es la decisión más urgente del [motor v0](motor-decisiones.md)
    (`level` `ok`, `caution` o `critical`, y una frase). Es null si la celda no
    tiene pronóstico determinístico.

### Pronóstico al crear o mover un lote
- Al crear un lote o cambiar su ubicación, `_load_weather_later`
  (`backend/apps/lotes/views.py`) encola, después del commit y en un solo
  callback, `archiver.fetch_cell_forecast` (pronóstico de la celda) y
  `archiver.backfill_history` (90 días de historial, ver
  [historico.md](historico.md)).
- `fetch_cell_forecast` (`backend/apps/archiver/tasks.py`) guarda todos los
  modelos de la celda por `archive_cell`, el mismo camino que la corrida de
  cada 6 h. Si la celda tiene un pronóstico determinístico de menos de
  `FRESH_FOR` (3 h, `apps/weather/ondemand.py`), no pide nada.
- Si el lote ya tiene reglas de alerta activas (un lote movido) y se guardó
  algo nuevo, encola `alerts.evaluate_rules`, como la corrida programada.
- Se apaga con `LOTE_FORECAST_ON_CREATE=false` (ver [entorno](../entorno.md)).

## Decisiones y por qué
- **Decisión:** `boundary` en un `JSONField` común, sin PostGIS.
  **Por qué:** en la Fase 1 el contorno solo se guarda y se dibuja. PostGIS
  suma una imagen y dependencias del sistema sin uso todavía.
- **Decisión:** `summary` es un valor de pronóstico, no una decisión.
  **Por qué:** el motor de decisiones llega en la Fase 2.
  (Reemplazada el 2026-11-03: el motor v0 se adelantó y `summary` suma
  `headline`. Los campos de la Fase 1 no cambian.)
- **Decisión:** cultivo y fecha de siembra en `Lote` (Fase 1).
  (Reemplazada el 2026-11-17 por la lista `plantings`.)
- **Decisión:** varios cultivos por lote, cada uno con hectáreas y fecha de
  siembra opcionales.
  **Por qué:** pedido del usuario: "puede ser que al lote lo dividan en varios
  cultivos". Eligió "Lista con hectáreas": cada parte con su superficie, que
  puede no saberse.
  **Alternativas descartadas:** un solo cultivo por lote, como antes.
- **Decisión:** si la suma de hectáreas pasa la superficie del lote, avisa la
  app; la API lo acepta.
  **Por qué:** la superficie del lote y las de cada cultivo suelen ser
  estimaciones; bloquear impediría guardar datos reales con algo de error.
- **Decisión:** la escritura reemplaza la lista entera en vez de editar cada
  cultivo por `id`.
  **Por qué:** el formulario siempre tiene la lista completa, y el máximo de 8
  hace barato reescribirla.
- **Decisión:** los errores por cultivo salen como lista, no como el diccionario
  por índice que DRF 3.18 usa por defecto.
  **Por qué:** es el contrato que usa el frontend para ubicar cada error en su
  fila; se arma en `PlantingListSerializer` sin cambiar la configuración global.
- **Decisión:** al migrar, cada lote con cultivo pasa a tener un `Planting` con
  ese cultivo y su fecha de siembra, sin hectáreas.
  **Por qué:** no se pierden datos existentes. La migración inversa devuelve al
  lote el primer cultivo; los demás se pierden, porque el modelo viejo admite uno.
- **Decisión:** redondear coordenadas en vez de rechazarlas.
  **Por qué:** el GPS del teléfono entrega más de 6 decimales, y 6 equivalen a ~10 cm.

- **Decisión:** pedir el pronóstico del lote apenas se crea o se mueve.
  **Por qué:** pedido del usuario ("falta el ver el clima por lote tambien"):
  un lote nuevo esperaba hasta 6 h la corrida programada y mostraba "Todavía
  no hay pronóstico".
  **Alternativas descartadas:** pedirlo dentro del request (como la búsqueda
  pública): con los ensembles tarda demasiado para el POST del lote.
- **Decisión:** si encolar falla (broker caído) se registra en el log y el lote
  se guarda igual.
  **Por qué:** guardar el lote es lo importante; la corrida programada trae el
  pronóstico después.
- **Decisión:** la evaluación de alertas se encola solo si el lote ya tenía
  reglas activas.
  **Por qué:** `evaluate_rules` evalúa todas las reglas de todos los usuarios;
  un lote nuevo no tiene reglas, así que correrla sería trabajo sin efecto.

## Cómo modificarlo
- La celda se calcula con `apps.archiver.cells.grid_cell`. Si cambia la
  resolución, los pronósticos viejos dejan de coincidir con los lotes.
- La lista calcula los `summary` de todas las celdas en una sola consulta y
  trae del JSON solo `time` y `temperature_2m`. Los `headline` salen de dos
  consultas más para todas las celdas (`apps.archiver.forecast.forecasts`), así
  que la cantidad de consultas no crece con los lotes.
- Migraciones de cultivos: `0002_planting` (tabla), `0003_copy_crops_to_plantings`
  (copia los datos, reversible) y `0004_remove_lote_crop_sowing_date`.
- Los cultivos son solo informativos: el motor de decisiones no los lee.
- Tests: `backend/tests/test_lotes.py`, `test_plantings.py` (API de cultivos y
  migración de datos ida y vuelta), `test_pronostico.py` (`TestHeadline`) y
  `test_lote_forecast_on_create.py`.

## Historial
- 2026-11-03: versión inicial (Fase 1).
- 2026-11-03: `summary.headline` y `GET /api/lotes/{id}/pronostico/`.
- 2026-11-16: el lote pide su pronóstico al crearse o moverse (S12), en vez de
  esperar la corrida de cada 6 h.
- 2026-11-17: varios cultivos por lote (`plantings`); `crop` y `sowing_date`
  salen del lote y los datos existentes se migran.
