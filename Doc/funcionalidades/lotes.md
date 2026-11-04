# Lotes
> Última actualización: 2026-11-03

## Qué hace
Cada usuario carga sus lotes con su ubicación exacta. Cultivo, fecha de siembra,
superficie y contorno son opcionales. Cada lote muestra la mínima pronosticada
para esta noche y un titular con la decisión más urgente. El detalle del
pronóstico está en [pronostico.md](pronostico.md).

## Cómo funciona
- App `backend/apps/lotes/`, modelo `Lote`, endpoints `/api/lotes/` (GET lista
  ordenada por nombre, POST) y `/api/lotes/{id}/` (GET, PATCH, DELETE).
- Cada usuario ve solo sus lotes: el de otro responde 404.
- Validaciones: latitud −56 a −21, longitud −74 a −53 (Argentina), nombre de
  hasta 80 caracteres, `crop` en `soja`, `maiz`, `trigo`, `girasol`, `cebada`,
  `sorgo`, `otro` o null, y `boundary` como `Polygon` GeoJSON con anillos cerrados.
- Las coordenadas se guardan con 6 decimales; si llegan más, se redondean.
- Los decimales (`latitude`, `longitude`, `area_ha`) salen como números JSON.
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

## Decisiones y por qué
- **Decisión:** `boundary` en un `JSONField` común, sin PostGIS.
  **Por qué:** en la Fase 1 el contorno solo se guarda y se dibuja. PostGIS
  suma una imagen y dependencias del sistema sin uso todavía.
- **Decisión:** `summary` es un valor de pronóstico, no una decisión.
  **Por qué:** el motor de decisiones llega en la Fase 2.
  (Reemplazada el 2026-11-03: el motor v0 se adelantó y `summary` suma
  `headline`. Los campos de la Fase 1 no cambian.)
- **Decisión:** redondear coordenadas en vez de rechazarlas.
  **Por qué:** el GPS del teléfono entrega más de 6 decimales, y 6 equivalen a ~10 cm.

## Cómo modificarlo
- La celda se calcula con `apps.archiver.cells.grid_cell`. Si cambia la
  resolución, los pronósticos viejos dejan de coincidir con los lotes.
- La lista calcula los `summary` de todas las celdas en una sola consulta y
  trae del JSON solo `time` y `temperature_2m`. Los `headline` salen de dos
  consultas más para todas las celdas (`apps.archiver.forecast.forecasts`), así
  que la cantidad de consultas no crece con los lotes.
- Tests: `backend/tests/test_lotes.py` y `test_pronostico.py` (`TestHeadline`).

## Historial
- 2026-11-03: versión inicial (Fase 1).
- 2026-11-03: `summary.headline` y `GET /api/lotes/{id}/pronostico/`.
