# Motor de decisiones v0
> Última actualización: 2026-11-03

## Qué hace
Convierte el pronóstico de un lote en tres decisiones con su motivo en una
frase: helada esta noche, ventana de pulverización de hoy y labores (próxima
lluvia fuerte). Aplica las reglas de `Doc/reglas-agronomicas.md`. Todavía no
está validado con backtesting: cada salida lleva `engine_version: "v0"` y
`validated: false`.

## Cómo funciona
- Paquete Python puro `backend/engine/`, sin Django. Recibe series horarias
  normalizadas (`Hour`, con hora local y viento a 10 m) y devuelve veredictos
  `{level, …, reason}` con `level` en `ok`, `caution` o `critical`.
- `config.py`: todos los umbrales, cada uno con la sección del documento de
  reglas y su etiqueta [V], [S] o [I]. Las funciones aceptan otro `Thresholds`
  (por ejemplo, límites más estrictos de una provincia).
- **Helada** (`frost.py`, §1):
  - Por modelo determinístico, la mínima a 2 m de 20:00 a 08:00 (la misma
    ventana que `summary`).
  - Noche radiativa si el promedio nocturno del viento a 10 m es < 10 km/h y el
    de `cloud_cover_low` < 25 % (sin nubes bajas, usa `cloud_cover`).
  - Suelo = `Tmin_2m − Δ`, con Δ 4 °C en noche radiativa y 0,5 °C si no.
  - `critical` si la mayoría de los modelos da ≤ 0 °C en el suelo; `caution` si
    alguno lo da o la mediana es ≤ 2 °C; si no, `ok`. El acuerdo sale como
    `"N de M modelos"`.
- **Pulverización** (`spray.py`, §2): cada hora toma el peor estado de Delta T
  (bulbo húmedo de Open-Meteo o Stull 2011), viento y ráfaga a 2 m
  (`0,75 · u10`), temperatura, inversión, lluvia en las 6 h siguientes y hoja
  mojada. La mejor ventana es la racha verde más larga entre ahora (o la salida
  del sol) y la puesta. `ok` con al menos 2 h verdes, `critical` si todas las
  horas de luz que quedan son rojas, `caution` en el resto.
- **Labores** (`fieldwork.py`, §3): el primer día con ≥ `HEAVY_RAIN_MM` (5 mm);
  `critical` con probabilidad ≥ 70 %, `caution` si es menor o no hay ensemble.
- **Cielo del día** (`sky`): tormenta (código WMO 95–99 en la mayoría de los
  modelos), lluvia (≥ 1 mm) o nubosidad media de 7 a 19 h: sol < 30 %,
  parcial < 70 %, nublado.
- **Titular** (`headline.py`): la decisión más urgente para la tarjeta del lote.
  Gana el peor nivel; en empate, helada, labores y pulverización. Si todo está
  `ok` y hay ventana, muestra la ventana.

## Decisiones y por qué
- **Decisión:** adelantar el motor v0 desde la Fase 2.
  **Por qué:** el usuario pidió ayuda para decidir ahora (L1 del feature
  `clima-y-fileteado`). Se rotula sin validar hasta el backtesting.
- **Decisión:** 5 mm como lluvia que impide entrar al lote.
  **Por qué:** supuesto sin fuente; INTA no da días de oreo (§3). Se calibra
  con los reportes del productor.
- **Decisión:** umbral de `critical` para labores en 70 % y ventana mínima de 2 h.
  **Por qué:** supuestos sin fuente, elegidos como punto de partida.
- **Decisión:** ráfaga a 2 m con el mismo factor 0,75 que el viento medio.
  **Por qué:** la tabla de §2 pide ráfaga a 2 m y Open-Meteo solo da 10 m.
  Supuesto sin fuente.
- **Decisión:** inversión dudosa (amarillo) cuando, de noche o en la primera
  hora de sol, se cumple solo una de "cielo < 30 %" o "viento < 10 km/h".
  **Por qué:** §2 define "dudosa" sin criterio; es una inferencia.
- **Decisión:** sin datos de temperatura nocturna, la helada sale `caution`.
  **Por qué:** el contrato no tiene un nivel "desconocido", y `ok` afirmaría
  algo que no se sabe.
- **Decisión:** en labores, para hoy solo cuenta la lluvia que falta caer.
  **Por qué:** a la noche el total del día incluye lluvia que ya cayó, y el
  aviso decía "Hoy se esperan 26 mm" cuando ya no quedaba nada (visto con datos
  reales el 2026-11-03).

## Cómo modificarlo
- Cambiar un umbral: editar `config.py` (y el documento de reglas si cambia la
  fuente). Los tests usan los valores por defecto.
- Cambiar el texto de un motivo: los tests comparan frases exactas.
- Tests: `backend/tests/test_engine_frost.py`, `test_engine_spray.py`,
  `test_engine_fieldwork.py` y `test_engine_headline.py`.

## Historial
- 2026-11-03: versión v0 (helada, pulverización, labores, cielo y titular).
