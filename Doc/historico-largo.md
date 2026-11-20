# Histórico largo de clima (investigación)
> Última actualización: 2026-11-20

Investigación, no implementada. Pregunta del usuario: cuánto cuesta acceder al
histórico mundial de clima para que el productor o la empresa "pueda tocar y
sincronizar su lote con el histórico de viento", y si conviene pagar un mes y
bajar "por lo menos los últimos 10 años".

## Qué hay hoy
- El [histórico por lote](funcionalidades/historico.md) ya existe: tabla
  `WeatherHour` por celda de 0,1°, viento, ráfaga, dirección, Delta T,
  inversión (temperatura a 80 m), lluvia, etc.
- Fuente: `open-meteo/historical-forecast` (`backend/apps/archiver/history.py`),
  es decir, pronósticos archivados en alta resolución, no un reanálisis.
- Al crear un lote se bajan 90 días, y una tarea suma las horas nuevas cada hora.
- Se usa el plan gratuito de Open-Meteo, que es solo para uso no comercial. En
  cuanto se cobre un plan hace falta uno pago, tanto para el pronóstico como
  para el histórico.

## Opciones y costos (a 2026-11-20)
| Opción | Precio | Qué da |
|---|---|---|
| Open-Meteo Standard | ≈ US$ 29/mes | Uso comercial, 1 M de llamadas/mes, pronóstico. **No** incluye la API histórica, ni ensembles, ni clima. |
| Open-Meteo Professional | ≈ US$ 99/mes | Uso comercial, 5 M de llamadas/mes, API histórica (ERA5 desde 1940, ERA5-Land desde 1950, IFS 9 km desde 2017), ensembles. |
| Visual Crossing | Gratis hasta 1.000 registros/día; después US$ 0,0001 por registro, o planes de ≈ US$ 35 y 150/mes | Otro proveedor: habría que integrarlo y exige citarlo como fuente. |
| ERA5 en Copernicus CDS | Gratis, también comercial (CC BY 4.0, citando la fuente) | El mismo dato base que el archivo de Open-Meteo, pero en bruto: grilla de 25 km (ERA5-Land, 11 km), unos 5 días de atraso, descarga y procesamiento propios. |

Los precios en dólares de Open-Meteo vienen de la primera consulta. La página
de precios leída el 2026-11-20 no los mostraba: confirmarlos antes de contratar.

## Idea evaluada: un mes de Professional para bajar 10 años

**Licencia.**
- Los datos de Open-Meteo se entregan bajo CC BY 4.0 ("The data obtained
  through the API is provided under the terms of the CC-BY 4.0 licence"), que
  permite uso comercial citando la fuente.
- La suscripción es "for the duration of your subscription": al cancelarla se
  corta el acceso a la API.
- Los términos no dicen qué pasa con lo ya descargado, y tampoco prohíben
  descargar en volumen ni guardar los datos.
- **Pendiente:** pedirle a Open-Meteo por escrito que confirme que se pueden
  conservar y usar los datos después de cancelar.

**Cuánto entra en un mes.**
- La regla de Open-Meteo: un pedido con más de 10 variables o de más de 2
  semanas para un punto cuenta como varias llamadas.
- Su ejemplo: 2 semanas con 15 variables = 1,5 llamadas, pero 4 semanas = 3,0.
  La fórmula exacta no está clara.
- Con unas 15 variables, 10 años de un punto son unas 400 a 600 llamadas.
- Con 5 M de llamadas salen unos 8.000 a 12.000 puntos en el mes.
- Estimación gruesa, sin contar celdas: alcanzaría para la zona agrícola núcleo
  a 0,1°.

**Peros.**
1. **El volumen.** 10 años son 87.600 horas por celda. Miles de celdas en
   `WeatherHour` son cientos de millones de filas, y no entran en el Postgres
   del VPS.
   - Propuesta: en la tabla, solo las celdas con lotes.
   - El resto, en archivos comprimidos (por ejemplo Parquet), que se cargan a
     la tabla cuando se crea un lote en esa celda.
2. **No es el mismo dato.**
   - El archivo `historical-forecast` que usamos hoy arranca alrededor de 2022
     (sin verificar), así que no llega a 10 años.
   - Para 10 años la fuente es ERA5 o ERA5-Land, un reanálisis: más suavizado
     y con ráfagas puntuales subestimadas.
   - Sirve para comparar campañas y ver el viento típico de la zona. Para
     auditar una aplicación de un día concreto conviene el histórico actual.
   - **Pendiente:** verificar si ERA5 trae lo necesario para calcular la
     inversión (temperatura a 80 m o niveles equivalentes).
3. **Igual se paga todos los meses.**
   - El pronóstico comercial necesita como mínimo Standard, todos los meses.
   - ERA5 es gratis directo en Copernicus: el mes de Professional se paga por
     comodidad, no por el dato.

## Recomendación (sin decidir)
1. Pagar un mes de Professional (≈ US$ 99) y bajar 10 años de ERA5-Land a
   archivos: las celdas con lotes y la zona núcleo.
2. Después pasar a Standard (≈ US$ 29/mes) para el pronóstico.
3. Sincronizar los días nuevos con el parámetro `past_days` del pronóstico, que
   ya usa `backend/apps/archiver/openmeteo.py`.
   - **Pendiente:** confirmar que Standard permite este uso.
   - Implica cambiar la fuente de la corrida horaria (`SOURCE` en `history.py`).
4. Antes de contratar, armar el plan del backfill: qué celdas, el formato y la
   cuenta exacta de llamadas, para confirmar que entra en un mes.

Alternativa sin pagar el histórico: bajar ERA5-Land de Copernicus con su API
(CDS), gratis pero con más trabajo de procesamiento.

## Fuentes
- [Open-Meteo — Terms](https://open-meteo.com/en/terms)
- [Open-Meteo — Pricing](https://open-meteo.com/en/pricing)
- [Open-Meteo — Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api)
- [Open-Meteo — API Subscriptions for Commercial Use](https://openmeteo.substack.com/p/api-subscriptions-for-commercial)
- [Visual Crossing — Weather API](https://www.visualcrossing.com/weather-api/)
- [ECMWF — licencia CC BY de Copernicus](https://forum.ecmwf.int/t/cc-by-licence-to-replace-licence-to-use-copernicus-products-on-02-july-2025/13464)
- [Copernicus CDS — Terms of use](https://cds.climate.copernicus.eu/disclaimer-privacy)

## Historial
- 2026-11-20: investigación inicial de costos y de la idea de bajar 10 años en
  un mes de Professional.
