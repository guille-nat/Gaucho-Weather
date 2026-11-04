# Pronóstico del lote
> Última actualización: 2026-11-03

## Qué hace
`GET /api/lotes/{id}/pronostico/` devuelve lo que el productor necesita para
decidir en su lote: ahora, hoy, lluvia caída en 7 días, 7 días, 48 horas y las
decisiones del [motor v0](motor-decisiones.md). Solo lee el archivo: nunca
llama a Open-Meteo al responder.

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
   now: {time, temperature_c, humidity_pct, wind_kmh, wind_dir_deg, gust_kmh},
   today: {max_c, min_c, sunrise, sunset},
   rain_past_7d_mm,
   daily: [{date, max_c, min_c, rain_mm, rain_probability_pct, sky}] (7),
   hourly: [{time, temperature_c, humidity_pct, wind_kmh, gust_kmh, rain_mm,
             rain_probability_pct}] (48),
   decisions: {frost_tonight, spray_today, field_work, engine_version, validated}}
  ```

## Decisiones y por qué
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
- Tests: `backend/tests/test_pronostico.py`.

## Historial
- 2026-11-03: versión inicial (feature `clima-y-fileteado`).
