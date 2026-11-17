# Histórico de clima y viento por lote
> Última actualización: 2026-11-17

## Qué hace
Para cada lote muestra el clima pasado: un resumen por día (máxima, mínima,
lluvia, viento y ráfaga máximos, humedad mínima, Delta T máximo y horas con
inversión) y el detalle hora a hora del viento a 10 m, ráfaga, dirección,
humedad, Delta T, inversión térmica, temperatura y lluvia. Cada hora dice si el viento
estaba dentro del rango para pulverizar, lo que un aplicador necesita para
justificar una aplicación. Los datos se guardan en una tabla propia.

## Cómo funciona

### Datos propios
- Modelo `WeatherHour` (`backend/apps/archiver/models.py`, migración `0002`):
  una fila por celda de 0,1° (igual que el archivador), fuente (`source`) y hora
  UTC. Guarda temperatura, humedad, punto de rocío, lluvia, viento, dirección y
  ráfaga, con nuestros nombres de campo, no los del proveedor.
- Parámetros de auditoría (migración `0003`, columnas nuevas que admiten nulo;
  las filas anteriores quedan con nulo):

  | Campo | Variable de Open-Meteo | Para qué |
  |---|---|---|
  | `temperature_80m_c` | `temperature_80m` | inversión térmica |
  | `wet_bulb_c` | `wet_bulb_temperature_2m` | Delta T |
  | `cloud_cover_pct` | `cloud_cover` | nubosidad |
  | `pressure_hpa` | `surface_pressure` | presión en superficie |
  | `radiation_wm2` | `shortwave_radiation` | radiación solar (promedio de la hora) |
- Fuente actual: `open-meteo/historical-forecast`, la Historical Forecast API
  de Open-Meteo (`OPEN_METEO_HISTORICAL_URL`, con `OPEN_METEO_API_KEY` si está
  configurada).
- `history.py`: `store_history` pide un rango por celda con `unixtime` (UTC) y
  `timezone=America/Argentina/Buenos_Aires`, así `start_date` y `end_date` son
  días locales y las horas de 21 a 23 de hoy llegan el mismo día (las horas se
  siguen guardando en UTC). Hace upsert, así una corrida posterior corrige las horas recientes que el
  proveedor completó después.

### Cuándo se carga

| Tarea | Cuándo | Qué carga |
|---|---|---|
| `archiver.backfill_history` | al crear o mover un lote, al confirmar la transacción | los últimos 90 días de su celda, una sola vez por celda |
| `archiver.fetch_history` | cada hora, a los 20 minutos (beat) | cada celda con lotes, desde el día de su última hora guardada (menos 1 día) hasta hoy |
| `archiver.fetch_smn_observations` | cada hora, a los 10 minutos (beat) | los últimos `SMN_LOOKBACK_DAYS` archivos diarios del SMN |

- `fetch_history` se cura sola: una celda sin horas recibe los 90 días
  completos (así se cargan los lotes creados antes de esta función), y si beat
  estuvo caído, la próxima corrida pide desde la última hora guardada. Un rango
  de más de 31 días (`MAX_DAYS`) se parte en pedidos de hasta 31 días, del más
  viejo al más nuevo.
- La corrida de las 04:20 (`REVISION_HOUR`) además vuelve a pedir los últimos 3
  días (`REFRESH_DAYS`), para corregir las horas recientes que el proveedor
  completa después.
- Devuelve y registra `{"stored", "failed", "cells"}`. Si falla un pedido de una
  celda, esa celda se corta ahí (no deja huecos detrás de su última hora) y se
  sigue con la próxima.
- El backfill se apaga con `HISTORY_BACKFILL_ON_CREATE=false` (los tests lo
  tienen apagado). Si el broker está caído, el lote se guarda igual y la
  corrida horaria lo completa.
- Las observaciones del SMN corren cada hora: una corrida perdida la recupera
  la siguiente. El upsert es por estación y hora, como antes.
- Las fallas de red o de formato se registran en el log y se sigue con la
  próxima celda.

### API y pantalla
- `GET /api/lotes/{id}/historico/?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`. Sin
  fechas, los últimos 7 días. Lee solo nuestra tabla.
- Responde `from`, `to`, `source`, `attribution`, `complete`, `days[]` y
  `hours[]`. Cada hora trae `spray_wind` (`ok`, `caution`, `critical` o null)
  y `spray_wind_causes`.
- Cada hora suma `temperature_80m_c`, `wet_bulb_c`, `cloud_cover_pct`,
  `pressure_hpa` y `radiation_wm2`, y dos derivados: `delta_t_c` (temperatura
  menos bulbo húmedo) e `inversion` (la temperatura a 80 m es mayor que a 2 m).
  Los dos son null si falta alguno de sus datos.
- Cada día suma `humidity_min_pct`, `delta_t_max_c` e `inversion_hours` (null
  si ninguna hora del día tiene las dos temperaturas).
- `complete` es falso mientras algún día pasado del rango tenga menos de 24
  horas (todavía se está cargando o el proveedor tiene un hueco).
- Errores (400, en español): formato de fecha, "hasta" posterior a hoy, "desde"
  posterior a "hasta", antes del 1 de enero de 2021, o más de 31 días.
- Pantalla `/lotes/:id/historico` (`LoteHistorico.tsx`), enlazada desde el lote
  como "Histórico de clima y viento": rango de 7 o 30 días o Desde/Hasta, tabla
  diaria y horas del día elegido con el chip "Apto", "Con cuidado", "No apto" o
  "Sin dato" y sus causas. Cada hora suma humedad, Delta T y la marca de
  inversión ("Hay inversión" o "Sin inversión", con ícono y palabra, nunca solo
  color; "—" si falta un dato), y la tabla diaria suma "Humedad mín", "Delta T
  máx" y "Horas con inversión". Un texto de ayuda explica Delta T (temperatura
  menos bulbo húmedo; entre 2 y 8 °C la gota no se evapora de más) y la
  inversión (más calor a 80 m que a 2 m). Son datos de modelo de Open-Meteo, no
  medidos en el lote. Muestra la atribución ("no medidos en el lote") y un
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
- **Decisión:** corrida horaria que se pone al día desde la última hora
  guardada, en lugar de una corrida diaria de los últimos 3 días.
  **Por qué:** pedido del usuario: "en /historico no esta guardando la info, la
  idea es que sea lo mas precisa que se guarde una auditoria completa del viento
  y de la direccion junto con parametros climaticos". Con la corrida diaria, una
  corrida perdida no se recuperaba nunca, los lotes viejos nunca se cargaban y
  las horas de hoy aparecían recién al día siguiente.
- **Decisión:** temperatura a 80 m, bulbo húmedo, nubosidad, presión y
  radiación.
  **Por qué:** son los parámetros que pide una auditoría de pulverización:
  inversión térmica (deriva lejana con aire estable), Delta T (evaporación de la
  gota) y las condiciones del cielo, además del viento.
- **Decisión:** costo acotado (supuesto, a partir de "haz cuantas llamadas
  necesites segun sea necesario para ser lo mas preciso posible con el clima sin
  descuidar el costo").
  **Por qué:** Open-Meteo cuenta llamadas fraccionarias: un pedido con más de 10
  variables o más de 2 semanas pesa más de 1 (variables / 10 × días / 14). Con
  12 variables:
  - la corrida horaria pide 2 a 4 días por celda: 1,2 llamadas; unas 29 por
    celda y por día (24 × 1,2). La revisión de las 04:20 entra en ese mismo
    pedido (4 días), sin costo extra;
  - el backfill de 90 días, una sola vez por celda nueva: 91 días en 3 pedidos,
    unas 7,8 llamadas (1,2 × 91 / 14), lo mismo que un solo pedido largo;
  - el costo lo mueven las celdas distintas, no los lotes: los lotes de una
    misma celda de 0,1° la comparten.
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
- 2026-11-17: auditoría (feature `auditoria-historico`): corrida horaria que se
  pone al día, parámetros de auditoría en la API y en la pantalla, días locales
  en el pedido (`timezone`) y SMN cada hora. Prueba real en desarrollo: 7
  celdas, 7457 horas guardadas, 0 fallas, en unos 7 segundos; con `timezone`,
  la celda del lote 12 llegó hasta la hora local en curso.
- 2026-11-16: versión inicial (feature `cuenta-planes-alertas`, T12 y T13).
  Prueba real en desarrollo: la celda del lote 1 guardó 2179 horas en un pedido.
