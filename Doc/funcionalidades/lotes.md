# Lotes
> Última actualización: 2026-11-20

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

### Cultivos en la pantalla del lote
- El formulario del lote tiene una lista "Cultivos": cada fila pide el cultivo
  (obligatorio), las hectáreas (opcionales, mayores que 0) y la fecha de
  siembra (opcional). La lista puede quedar vacía, repetir un cultivo y tener
  hasta 8 filas.
- Si se conocen la superficie del lote y las hectáreas de los cultivos, y los
  cultivos suman más, el formulario avisa pero deja guardar: el productor
  puede no tener el dato exacto y no queremos frenarlo.
- En la página del lote, "Cambiar cultivos" abre el mismo editor en un
  `<dialog>` modal y guarda solo `plantings` con PATCH, para cambiar el
  cultivo en el campo sin pasar por todo el formulario. Esc o Cancelar
  descartan el cambio.
- Los datos del lote se agrupan en Cultivos, Campo y Lugar, con un ícono por
  dato. Cada cultivo es un chip con una marca de color y su nombre: el color
  ayuda a distinguirlos, pero nunca es lo único que dice qué cultivo es.
- La línea de la tarjeta nombra cada cultivo una vez ("Soja · Maíz").
- Un error del servidor sobre una fila llega como `"[índice] mensaje"`
  (`api/client.ts`) y se muestra como "Cultivo N: mensaje".

### La página del lote como tablero de decisiones
La página `/lotes/:id` (`frontend/src/pages/LoteDetail.tsx`, con la vista
`ForecastView` en modo `block`) responde primero qué hacer hoy en ese lote:

- Arriba, un encabezado compacto: nombre, cada cultivo con su fecha de
  siembra ("Maíz (siembra 18/9)"), hectáreas, establecimiento y localidad, y
  un solo lápiz para editar. Debajo, cuándo se hizo el pronóstico, con su día:
  "Pronóstico jue 19 · 18:00 · 3 modelos" (de `fetched_at`).
- "Hoy en este lote" lista las tres decisiones con la más urgente primero
  (alerta, después ojo, después bien). Si empatan, el orden es helada,
  pulverización, labores. Cada una muestra su frase y, debajo, la evidencia:
  - Pulverizar: viento y ráfagas en las horas de la ventana ("viento 12–17 ·
    ráfagas 17–24 km/h"). La ventana aparece una sola vez, en la frase.
  - Labores: "cayeron N mm en 7 días" (`rain_past_7d_mm`).
  - Helada: el suelo, la mínima a 2 m como mediana de los modelos y el modelo
    más frío al lado, con "Ver modelos" para el detalle.
- "Ahora" es una franja de una línea (temperatura, cielo, máxima y mínima,
  viento) con la salida y la puesta del sol.
- "Próximas horas" es una tabla con una fila por hora: estado de
  pulverización, viento con dirección, ráfagas, Delta T, temperatura,
  humedad, lluvia, probabilidad y causas. Las horas de la ventana dicen
  "Ventana" y llevan una franja con borde dorado. Muestra 24 horas y
  "Ver las 48 horas" agrega el resto. El estado y la dirección vienen de
  `hourly[].spray` y `hourly[].wind_direction_deg` (ver
  [pronostico.md](pronostico.md)).
- Después de los 7 días: el enlace al Histórico, "Datos del lote" plegado
  (con "Cambiar cultivos") y los créditos.
- En escritorio, las decisiones y "Ahora" van a la izquierda y los 7 días a la
  derecha; debajo, las horas ocupan todo el ancho; al final, el Histórico, los
  datos y los créditos.
- "Borrar lote" está en la pantalla de edición, con la misma confirmación.

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
  ese cultivo y su fecha de siembra, sin hectáreas. Un lote con fecha de siembra
  pero sin cultivo (el formulario viejo lo permitía) recibe un `Planting` "Otro"
  con esa fecha.
  **Por qué:** no se pierden datos existentes; "Otro" se ve en la ficha y el
  productor lo cambia con "Cambiar cultivos". La migración inversa devuelve al
  lote el primer cultivo (un "Otro" vuelve como "otro", no como vacío); los demás
  se pierden, porque el modelo viejo admite uno.
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
- **Decisión:** la página del lote es un tablero: decisiones primero, por
  urgencia, cada una con su evidencia; los datos fijos plegados y "Borrar
  lote" en la edición.
  **Por qué:** pedido del usuario: "no es tan util la dispocicion con lo que se
  enseñan los detalles del lote, pensa en un productor o en un ingeniero". Las
  decisiones quedaban debajo del pliegue en un teléfono, en un orden fijo, y la
  evidencia estaba lejos de cada decisión. La hora del pronóstico estaba abajo
  y sin día.
  **Alternativas descartadas:** dejar la vista de Inicio con las decisiones
  agregadas (la que había).
- **Decisión:** en escritorio, la tabla de horas va a todo el ancho, debajo de
  las decisiones y los 7 días (2026-11-25).
  **Por qué:** con las horas en la columna derecha, a 1280 px la tabla
  necesitaba 927 px y tenía 618: "Lluvia" quedaba cortada y "Prob." y "Causas"
  escondidas en un scroll sin aviso, mientras la columna izquierda quedaba
  vacía. A todo el ancho entran las 10 columnas desde 960 px.
  **Alternativas descartadas:** mantener las horas a la derecha y compactar la
  tabla (columna izquierda más angosta, encabezados en dos líneas): entraba
  justo a 1280 px y dejaba el hueco vacío.
- **Decisión:** la mínima a 2 m se nombra como mediana y se muestra el modelo
  más frío al lado.
  **Por qué:** el motor usa la mediana de los modelos; "Ver modelos" mostraba
  un modelo más frío y las dos cifras parecían contradecirse.
- **Decisión:** la tabla de horas muestra 24 filas y el resto a pedido.
  **Por qué:** 48 filas empujan los 7 días varias pantallas hacia abajo en un
  teléfono; las primeras 24 cubren el día de trabajo y la noche.

