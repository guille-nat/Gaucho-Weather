# Histórico de clima y viento por lote
> Última actualización: 2026-11-16

## Qué hace
Para cada lote muestra el clima pasado: un resumen por día (máxima, mínima,
lluvia, viento y ráfaga máximos) y el detalle hora a hora del viento a 10 m,
ráfaga, dirección, temperatura, humedad y lluvia. Cada hora dice si el viento
estaba dentro del rango para pulverizar, lo que un aplicador necesita para
justificar una aplicación. Los datos se guardan en una tabla propia.

## Cómo funciona

### Datos propios
- Modelo `WeatherHour` (`backend/apps/archiver/models.py`, migración `0002`):
  una fila por celda de 0,1° (igual que el archivador), fuente (`source`) y hora
  UTC. Guarda temperatura, humedad, punto de rocío, lluvia, viento, dirección y
  ráfaga, con nuestros nombres de campo, no los del proveedor.
- Fuente actual: `open-meteo/historical-forecast`, la Historical Forecast API
  de Open-Meteo (`OPEN_METEO_HISTORICAL_URL`, con `OPEN_METEO_API_KEY` si está
  configurada).
- `history.py`: `store_history` pide un rango por celda con `unixtime` (UTC) y
  hace upsert, así una corrida posterior corrige las horas recientes que el
  proveedor completó después.

### Cuándo se carga

| Tarea | Cuándo | Qué carga |
|---|---|---|
| `archiver.backfill_history` | al crear o mover un lote, al confirmar la transacción | los últimos 90 días de su celda, una sola vez por celda |
| `archiver.fetch_history` | todos los días a las 04:30 (beat) | los últimos 3 días de todas las celdas con lotes |

- El backfill se apaga con `HISTORY_BACKFILL_ON_CREATE=false` (los tests lo
  tienen apagado). Si el broker está caído, el lote se guarda igual y la
  corrida diaria completa.
- Las fallas de red o de formato se registran en el log y se sigue con la
  próxima celda.

### API y pantalla
- `GET /api/lotes/{id}/historico/?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`. Sin
  fechas, los últimos 7 días. Lee solo nuestra tabla.
- Responde `from`, `to`, `source`, `attribution`, `complete`, `days[]` y
  `hours[]`. Cada hora trae `spray_wind` (`ok`, `caution`, `critical` o null)
  y `spray_wind_causes`.
- `complete` es falso mientras algún día pasado del rango tenga menos de 24
  horas (todavía se está cargando o el proveedor tiene un hueco).
- Errores (400, en español): formato de fecha, "hasta" posterior a hoy, "desde"
  posterior a "hasta", antes del 1 de enero de 2021, o más de 31 días.
- Pantalla `/lotes/:id/historico` (`LoteHistorico.tsx`), enlazada desde el lote
  como "Histórico de clima y viento": rango de 7 o 30 días o Desde/Hasta, tabla
  diaria y horas del día elegido con el chip "Apto", "Con cuidado", "No apto" o
  "Sin dato" y sus causas. Muestra la atribución ("no medidos en el lote") y un
  aviso si los datos están incompletos. Se puede leer sin conexión (queda en
  la caché persistida de `lotes`).

## Decisiones y por qué
- **Decisión:** guardar el histórico en una base propia, independiente del
  proveedor.
  **Por qué:** pedido del usuario: "el de openmetro y guardarlos nosotros en una
  db por las dudas que cambiemos de proveedor, la idea es hacer nuestra base de
  datos tambien aparte de nutrirnos de las existentes". La columna `source`
  permite sumar otro proveedor sin cambiar la API ni la pantalla.
- **Decisión:** Historical Forecast API en lugar de ERA5.
  **Por qué:** une las primeras horas de cada corrida de los modelos, así sigue
  lo que realmente pasó, con datos horarios desde 2021. ERA5 es más grueso y
  está pensado para series climáticas.
- **Decisión:** la API lee solo nuestra tabla.
  **Por qué:** regla de arquitectura: las APIs con cuenta no llaman a
  proveedores al responder (ver [arquitectura](../arquitectura.md)).
- **Decisión:** la calificación del viento para pulverizar se comparte con el
  motor (`engine.spray.rate_wind` y `wind_findings`).
  **Por qué:** el histórico y el veredicto de pulverización usan los mismos
  umbrales; si cambian, cambian para los dos.
- **Decisión:** 90 días de backfill, 31 días por pedido y disponible en todos
  los planes.
  **Por qué:** supuestos del plan aprobado, sin confirmar con el usuario.
- **Decisión:** la pantalla aclara que los datos son modelados, no medidos.
  **Por qué:** son datos de modelo de Open-Meteo (CC BY 4.0) para la celda, no
  de una estación en el lote.

## Cómo modificarlo
- **Otro proveedor:** guardar sus filas con otro `source`. Hoy
  `lote_history` filtra por `SOURCE`, así que la lectura tendría que elegir la
  fuente.
- **Uso comercial:** la Historical Forecast API requiere el plan Professional
  de Open-Meteo (prefijo `customer-` en la URL y la clave).
- Correr a mano: `docker compose exec backend python manage.py shell -c
  "from apps.archiver.tasks import fetch_history; fetch_history()"`.
- Tests: `backend/tests/test_history.py`.

## Historial
- 2026-11-16: versión inicial (feature `cuenta-planes-alertas`, T12 y T13).
  Prueba real en desarrollo: la celda del lote 1 guardó 2179 horas en un pedido.
