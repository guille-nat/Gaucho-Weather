# Reglas agronómicas del motor de decisiones
> Última actualización: 2026-11-03

## Qué es
Las reglas y los umbrales que usará el motor de decisiones (helada,
pulverización, labores, siembra y cosecha), cada uno con su fuente. Es el
resultado de la Fase 0 del [plan de reescritura](plan-reescritura.md).

El proyecto no cuenta con un ingeniero agrónomo. Por eso cada regla cita la
bibliografía técnica en la que se basa, y la validación real se hace con
**backtesting** contra datos observados, no por criterio de autoridad.

**Leyenda:**
- **[V]** Verificado en la fuente citada.
- **[S]** Fuente secundaria (prensa o resumen); no se leyó el texto primario.
- **[I]** Inferencia o propuesta del equipo, sin fuente. Es un valor inicial
  que hay que calibrar con backtesting.

Todos los umbrales tienen que poder configurarse, no ir fijos en el código,
porque se van a ajustar con datos.

## 1. Helada

### Definiciones
- **[V]** Según INTA (Instituto de Clima y Agua):
  - **Helada meteorológica:** temperatura en abrigo a 1,5 m < 0 °C.
  - **Helada agrometeorológica:** temperatura en abrigo < 3 °C, que equivale a
    ≤ 0 °C a nivel del suelo (termómetro "a la intemperie", a 5 cm del suelo).
  - [Fuente](https://www.argentina.gob.ar/node/397275)
- **[V]** FAO usa "≤ 0 °C" en lugar de "< 0 °C".
  [Fuente](https://www.fao.org/4/y7223e/y7223e07.htm)
  **Decisión:** usar **≤ 0 °C**.

### Temperatura a nivel del suelo
Los modelos pronostican la temperatura a 2 m, pero el cultivo se daña a ras del
suelo. En noches despejadas y calmas el suelo puede estar varios grados más frío.

- **[V]** En pasto, la mínima es en promedio 5 °C menor que en abrigo, con un
  rango de 4,2 a 6,3 °C (Paraná, Brasil).
  [Fuente](https://ojs.uel.br/revistas/uel/index.php/semagrarias/article/view/30322)
- **[V]** En Anguil, a 5 cm se registran cinco veces más heladas muy fuertes que
  en abrigo.
  [Fuente](https://cerac.unlpam.edu.ar/index.php/semiarida/article/download/2668/2538)
- **[I]** Regla inicial: `Tmin_suelo = Tmin_2m − Δ`.
  - **Noche radiativa** (despejada y calma): Δ = 4 °C.
  - **Noche nublada o ventosa:** Δ = 0,5 °C.
  - Δ se calibra por zona con pares abrigo/5 cm de INTA SIGA.
  - Como predictor alternativo se prueba `surface_temperature`.

### Tipo de helada
- **Radiativa:** cielo despejado, sin viento, con inversión térmica.
- **Advectiva:** nublado, ventoso, y puede seguir bajo cero de día.
- **[V]** FAO considera radiativa una noche con viento ≤ 2 m/s y sin nubes ni
  niebla.
  [Fuente](https://www.fao.org/4/y7223e/y7223e0b.htm)
- **[I]** Con variables de Open-Meteo, una noche es radiativa si:
  - `wind_speed_10m` < 10 km/h, y
  - `cloud_cover_low` < 25 %.
  - Los porcentajes de nubosidad no tienen fuente: hay que calibrarlos.

### Probabilidad
- **[I]** `P(helada) = miembros del ensemble con Tmin_suelo corregida ≤ umbral /
  total de miembros`.
  - Primero combinar ECMWF (51 miembros), GFS (31) e ICON (40) con pesos iguales.
  - Después ajustar los pesos según el backtesting.
- **Paso temporal:** los ensembles de ECMWF y GFS vienen cada 3 h y pueden
  perder la mínima real, que ocurre al amanecer. Hay que corregirla con el
  backtesting o con ICON-EPS, que es horario.
- **Sesgo:**
  - **[V]** Una corrección de sesgo con media móvil de 7 a 14 días por zona
    mejora el pronóstico de temperatura a 2 m.
    [NWS TA 04-10](https://www.weather.gov/media/wrh/online_publications/TAs/ta0410.pdf) ·
    [ECMWF](https://www.ecmwf.int/sites/default/files/elibrary/2021/19913-statistical-post-processing-ensemble-forecasts-belgian-met-service.pdf)
  - **[S]** El signo del sesgo cambia según el régimen: con capa estable el
    modelo sale más cálido, y si subestima las nubes sale más frío. Por eso hay
    que estratificar por régimen (radiativa o advectiva).
    [Fuente](https://www.ecmwf.int/sites/default/files/elibrary/2018/18878-addressing-biases-near-surface-forecasts.pdf)

### Intensidad
**[V]** Clases sobre la temperatura mínima, usadas por INTA Anguil. No hay un
estándar del SMN.

| Clase | Temperatura mínima |
|---|---|
| Suave | 0 a −1,9 °C |
| Moderada | −2 a −3,9 °C |
| Intensa | −4 a −5,9 °C |
| Muy intensa | ≤ −6 °C |

### Temperaturas críticas por cultivo
- **[V]** Rangos de la FAO, Tabla 4.5, en °C de tejido.
  [Fuente](https://www.fao.org/4/y7223e/y7223e0a.htm)
  - FAO recomienda sumar unos 0,5 °C, porque los valores de campo suelen ser más
    altos que los de laboratorio.
  - El encabezado de la tabla se leyó corrupto: hay que confirmar el orden de
    las columnas en el PDF.

| Cultivo | Germinación | Floración | Fructificación |
|---|---|---|---|
| Trigo | −9 a −10 | −1 a −2 | −2 a −4 |
| Cebada | −7 a −8 | −1 a −2 | −2 a −4 |
| Maíz | −2 a −3 | −1 a −2 | −2 a −3 |
| Girasol | −5 a −6 | −2 a −3 | −2 a −3 |
| Soja | −3 a −4 | −2 a −3 | −2 a −3 |

- **Trigo [S]:** según INTA Balcarce, el daño empieza en −1,5 °C a la altura de
  la espiga, con más de 37 minutos de exposición. La etapa más sensible va de
  antesis a inicio de llenado.
  [Fuente](https://news.agrofy.com.ar/noticia/178856/trigo-disenan-modelo-estimar-dano-helada)
- **Maíz [S]:** el punto de crecimiento queda bajo tierra hasta V5–V6, así que
  tolera daño en las hojas. Es letal con ≤ −2,2 °C durante varias horas.
  [Fuente](https://www.agry.purdue.edu/ext/corn/News/timeless/growingpoints.html)
- **Soja [S]:** queda expuesta desde la emergencia; el daño aparece entre 0 y
  −2,2 °C.
  [Fuente](https://www.canr.msu.edu/news/resources_to_assess_frost_damage_for_corn_and_soybeans)

**Implicancia para el producto:** sin saber el cultivo y su estado fenológico,
el aviso solo puede ser genérico ("helada a nivel del suelo"). Para que sea
específico, el lote tiene que tener cultivo y fecha de siembra cargados.

### Climatología de referencia
- **[V]** Anguil, 1973–2009
  ([fuente](https://49jaiio.sadio.org.ar:443/pdfs/cai/CAI_07.pdf)):

| Altura | Primera helada | Última helada | Período libre de heladas |
|---|---|---|---|
| Abrigo | 24/4 | 9/10 | 197 días |
| 5 cm | 30/3 | 10/11 | 139 días |

- **[S]** Fechas medias de última helada: Pergamino 6/10 y Venado Tuerto 2/10.

## 2. Pulverización

**Regla de combinación:** cada hora toma el peor estado entre todas las reglas.

| Variable | Verde | Amarillo | Rojo | Fuente |
|---|---|---|---|---|
| Delta T (°C) | 2 a 8 | < 2 u 8 a 10 | > 10 (> 12 si el usuario declara gota muy gruesa) | [V] [GRDC](https://grdc.com.au/__data/assets/pdf_file/0025/618811/practical-tips-for-spraying-grdc-20250131.pdf) |
| Viento a 2 m (km/h) | 5 a 15 | 3 a 5 o 15 a 20 | < 3 o > 20 | [V] [APVMA](https://apvma.gov.au/sites/default/files/2023-06/Guidelines%20for%20updating%20spray%20drift%20instructions%20on%20labels%20when%20a%20full%20spray%20drift%20risk%20assessment%20has%20not%20been%20undertaken.pdf) (3–20) · GRDC (mín. 5) |
| Ráfaga a 2 m (km/h) | ≤ 20 | 20 a 28 | > 28 | [I] sin fuente |
| Temperatura (°C) | ≤ 28 | 28 a 30 | > 30 | [I] |
| Inversión térmica | No | Dudosa | Probable | [I] (ver abajo) |
| Lluvia en la ventana de lavado | No | — | ≥ 0,5 mm | [I] sobre tiempos de [UF/IFAS](https://edis.ifas.ufl.edu/publication/AG359) |
| Lluvia o rocío previos | No | Lluvia ≥ 1 mm en las 2 h previas, o T − Td < 2 °C | — | [I] |

- **Delta T [V]:** es la diferencia entre la temperatura del aire y la de bulbo
  húmedo.
  - Se usa la variable de bulbo húmedo de Open-Meteo, o se calcula con la
    fórmula de Stull (2011), que tiene un error menor a 0,3 °C.
    [Fuente](https://journals.ametsoc.org/view/journals/apme/50/11/jamc-d-11-0143.1.xml)
  - Por qué importa: con Delta T bajo las gotas finas duran más y hay más
    deriva; con Delta T alto se evaporan antes de llegar.
- **Viento a 2 m [V]:** se calcula como `u2 = 0,75 · u10` (FAO-56, ec. 47).
  [Fuente](https://www.fao.org/4/x0490e/x0490e07.htm)
  - Hace falta un viento mínimo porque la calma anticipa una inversión térmica.
- **Inversión térmica [I]:** es probable si se dan las tres condiciones:
  - es de noche o la primera hora después del amanecer,
  - `cloud_cover` < 30 %, y
  - el viento a 10 m es < 10 km/h.
  - Si `temperature_80m − temperature_2m > 0`, la inversión se confirma. Esa
    señal no sirve para descartarla, porque el modelo no ve inversiones de
    pocos metros.
  - Base física **[V]**:
    [NDSU](https://ndsu.edu/agriculture/extension/publications/air-temperature-inversions-causes-characteristics-and-potential-effects) ·
    [GRDC](https://grdc.com.au/resources-and-publications/all-publications/factsheets/2022/hazardous-inversion)
- **Ventana sin lluvia por tipo de producto [V/I]:** valores por defecto que el
  usuario reemplaza con la etiqueta.
  - **[V]** Según UF/IFAS: glifosato 0,5 a 4 h, paraquat menos de 30 min y
    2,4-D amina unas 6 h.
  - **[I]** Valores por defecto propuestos:

| Tipo de producto | Ventana sin lluvia |
|---|---|
| Contacto | 1 h |
| Glifosato | 6 h |
| Hormonales | 6 h |
| Sistémicos | 6 h |
| Fungicida sistémico | 4 h |
| Insecticida | 2 h |

- **Pendiente:** las normas provinciales (Ley 10.699 de Buenos Aires, Ley 9.164
  de Córdoba, Ley 11.273 de Santa Fe, Dec. 2239/19 de Entre Ríos) pueden fijar
  límites más estrictos. No se pudieron leer, y hay que verificarlas antes de
  publicar. El motor tiene que permitir ajustar los umbrales por jurisdicción.

## 3. Labores: piso transitable
- **[V]** El suelo es transitable si la humedad de 0 a 10 cm está por debajo de
  un porcentaje de la capacidad de campo, que depende de la textura:
  - suelos arcillosos y franco-arcillo-limosos: < 85 %;
  - suelos arenosos: < 95 %.
  - [Fuente](https://escholarship.org/uc/item/1590v33s)
- **[I]** Con datos de Open-Meteo:
  - Calcular `soil_moisture_0_to_7cm` (ECMWF) dividido por la capacidad de campo
    según la textura.
  - Capacidad de campo por defecto para los Argiudoles de la Pampa: 0,32 m³/m³,
    a calibrar.
  - Se considera "piso apto" con al menos 2 días seguidos debajo del umbral.
  - La humedad de suelo de un modelo global es aproximada. Por eso el aviso
    sugiere ("probablemente transitable"), no afirma.
- **Fuera de alcance:** INTA no da un número de días de oreo, y el productor
  conoce su lote. Más adelante, sus reportes ("entré" / "no entré") calibran
  el umbral.

## 4. Siembra
**Temperatura del suelo a la profundidad de siembra** (`soil_temperature_6cm`):

| Cultivo | Umbral | Fuente |
|---|---|---|
| Maíz | ≥ 10 °C durante 3 días seguidos y en aumento | [S] técnico de INTA ([Agrofy](https://news.agrofy.com.ar/noticia/177188/cinco-consejos-encarar-siembra-maiz)) · [Corteva](https://www.corteva.com/es/agronomia-y-servicios/informacion-agronomica/consideraciones-sobre-la-siembra-temprana-de-maiz.html) |
| Sorgo | ≥ 18 °C durante 3 días seguidos | [V] INTA Anguil ([CONICET](https://ri.conicet.gov.ar/bitstream/handle/11336/160936/CONICET_Digital_Nro.33dc0682-e117-4ad5-9bee-69f97f658584_A.pdf)) |
| Girasol | ~15 °C estable | [S] [Engormix](https://www.engormix.com/agricultura/siembra-girasol/implantacion-girasol_a26489/) |
| Soja | ≥ 14 °C | [I] valor habitual de la literatura; falta una fuente de INTA |
| Trigo | ≥ 4 °C | [I] valor habitual de la literatura; falta una fuente de INTA |

- **Humedad para sembrar maíz [S]:** al menos ~24 % en los primeros 10 cm. Por
  debajo de 20 % germina pero no emerge (INTA Marcos Juárez).
- **Restricción por helada:** no recomendar siembra si la probabilidad de
  helada a nivel del suelo en los 10 días siguientes supera un umbral
  configurable. **[I]**

## 5. Cosecha
- **[V]** En soja, cosechar con 15 % de humedad reduce a la mitad las pérdidas
  por desgrane respecto de esperar al 13,5 %. Más de 10 días de lluvia sobre
  soja seca causan más pérdidas que cosechar húmedo.
  [Fuente](https://www.argentina.gob.ar/node/424701)
- **[I]** No conviene trillar si se da cualquiera de estas condiciones:
  - lluvia > 3 mm en las últimas 24 h;
  - HR > 85 %;
  - `temperature_2m − dew_point_2m` < 2 °C (rocío).

## 6. Balance hídrico (para fases posteriores)
- **[V]** Se usa el método de FAO-56: `ETc = Kc · ET0`, y el agotamiento
  `Dr` se actualiza día a día. El cultivo sufre estrés cuando `Dr` supera
  `RAW = p · TAW`.
  [Método](https://www.fao.org/4/x0490e/x0490e0e.htm) ·
  [Tablas](https://www.fao.org/4/x0490e/x0490e0b.htm)

| Cultivo | Kc medio | Kc final | p |
|---|---|---|---|
| Maíz | 1,20 | 0,35–0,60 | 0,55 |
| Soja | 1,15 | 0,50 | 0,50 |
| Girasol | 1,0–1,15 | 0,35 | 0,45 |
| Trigo | 1,15 | 0,25–0,40 | 0,55 |
| Sorgo | 1,0–1,1 | 0,55 | 0,55 |

## 7. Fuentes de datos
### Pronóstico
- **Open-Meteo**, como fuente principal.
  - **Variables:** temperatura a 2, 80 y 120 m, punto de rocío, bulbo húmedo,
    viento y ráfagas a 10 m, nubosidad, temperatura y humedad del suelo,
    ET0 y VPD.
  - **Cobertura por modelo:**
    - ECMWF trae humedad de suelo de 0 a 7 cm, pero no temperaturas a 80 y 120 m.
    - GFS trae humedad de suelo de 0 a 10 cm.
    - ICON trae sus propias capas de suelo.
  - **Ensembles:** solo ECMWF y GFS traen variables de suelo, y ninguno trae
    temperaturas en altura.
  - [Documentación](https://open-meteo.com/en/docs) ·
    [Ensemble API](https://open-meteo.com/en/docs/ensemble-api)
- **Licencia de Open-Meteo:**
  - El plan gratuito es solo para uso **no comercial**.
  - Para uso comercial con ensembles e histórico hace falta el **plan
    Professional**.
  - **Precios publicados en 2023:** Standard USD 29/mes (1 millón de llamadas,
    sin ensembles ni histórico) y Professional USD 99/mes (5 millones de
    llamadas, con ensembles e histórico).
    [Fuente](https://openmeteo.substack.com/p/api-subscriptions-for-commercial)
    La página de precios ya no los muestra, así que hay que confirmarlos en el
    panel de clientes.
  - El plan gratuito permite "evaluation and prototyping": el desarrollo y el
    backtesting pueden hacerse sin pagar.
  - Los datos son CC BY 4.0, con atribución obligatoria.
  - [Fuente](https://open-meteo.com/en/pricing)
- **SMN WRF-DET**, como alternativa local y gratuita:
  - resolución de 4 km, alcance de 72 h y licencia CC BY 2.5 AR;
  - se publica en el bucket público de S3 `smn-ar-wrf`;
  - [Fuente](https://registry.opendata.aws/smn-ar-wrf-dataset)
  - Sirve para comparar el corto plazo, aunque no tiene ensemble.

### Observaciones para el backtesting
- **SMN:**
  - Datos abiertos solo horarios (`datohorario<AAAAMMDD>.txt`), sin mínima
    diaria, con licencia CC BY 2.5 AR (permite uso comercial con atribución).
  - La mínima en abrigo se puede calcular a partir de esos datos de ahora en
    adelante.
  - Las series largas probablemente requieran un pedido formal.
- **INTA SIGA:**
  - Es la única fuente encontrada con la **mínima a 5 cm** ("a la intemperie"),
    que es la referencia real de helada a nivel del suelo.
  - Columnas `Temperatura_Abrigo_150cm_Minima` y
    `Temperatura_Intemperie_5cm_Minima`, solo en las estaciones convencionales
    (EMC).
  - Descarga sin registro en `siga.inta.gob.ar/document/series/<id>.xls` y con
    el paquete de R.
    [Fuente](https://rdrr.io/github/AgRoMeteorologiaINTA/siga/)
  - Licencia **CC BY-NC**: usarla para validar internamente un producto
    comercial es una zona gris, y hay que consultarlo con INTA.
- **BCR GEA** (red de la Bolsa de Comercio de Rosario):
  - La descarga es solo para suscriptores, con "todos los derechos reservados".
  - Para usarla hace falta una licencia directa de la BCR.
  - [Fuente](https://www.bcr.com.ar/es/mercados/gea/estaciones-meteorologicas/red-de-estaciones-meteorologicas)

#### Estaciones de la zona inicial (sur de Santa Fe, zona núcleo)
**[V]** Revisadas en una copia de SIGA de junio de 2022, porque el sitio en vivo
no respondía:

| Estación (ID SIGA) | Ubicación | Mín. abrigo | Mín. 5 cm |
|---|---|---|---|
| INTA Oliveros EMC (`NH0472`) | −32,55, −60,85 | 1961 a 2017-05 | 1962 a 2017-05 |
| UNR Zavalla EMC (`NH0046`) | −33,02, −60,88 | 1973 a 2022-05 | Hasta 2006-11 |
| INTA Marcos Juárez EMC (`NH0502`) | −32,68, −62,12 | 1967 a 2022-01 | Hasta 2022-01 |
| Villa Cañas (`A872870`), automática | −33,96, −61,63 | 2011 a 2022 | No |
| INTA Pergamino EMC (`NH0145`) | −33,93, −60,55 | Sin verificar | Sin verificar |

**[I] Climatología calculada** con esas series (helada = mínima ≤ 0 °C, años con
al menos 350 días y sin control de calidad):

| Estación | Nivel | Días de helada por año | Primera helada media | Última helada media |
|---|---|---|---|---|
| Oliveros | Abrigo | 14,3 | 31/5 | 2/9 |
| Oliveros | 5 cm | 49,5 | 29/4 | 14/10 |
| Zavalla | 5 cm | 51,6 | 2/5 | 17/10 |
| Marcos Juárez | 5 cm | 48,9 | 23/4 | 9/10 |

A nivel del suelo hiela unas **3,5 veces más días** que en abrigo. Esto
confirma la decisión de avisar la helada a nivel del suelo.

**Problema de solapamiento:**
- Los pronósticos archivados empiezan en 2017 (ECMWF), 2021 (GFS) y 2022
  (ICON).
- Las mínimas a 5 cm disponibles terminan entre 2017 y 2022.
- Hoy el período en común es de pocos años y casi solo en Marcos Juárez.
- **Acción (decidida el 2026-11-03):**
  - Arrancar con datos propios: registrar desde la Fase 1 los pronósticos y las
    observaciones horarias del SMN (Rosario, Venado Tuerto y Marcos Juárez
    Aero).
  - El pedido a INTA de las series recientes y de la autorización queda para
    más adelante.
- **CONAE SAOCOM:** mapa diario de humedad de suelo hasta 50 cm para 5
  provincias pampeanas. Sirve para validar el piso transitable.
  [Fuente](https://www.argentina.gob.ar/productos-saocom)

### Pronósticos archivados
- **Historical Forecast API:** ECMWF desde 2017 (HRES), GFS desde 2021 e ICON
  desde 2022.
- **Previous Runs API:** desde enero de 2024, con plazos de 1 a 7 días.
- **No guardan los miembros del ensemble.** Por eso, para medir la probabilidad
  del ensemble, hay que **guardar los ensembles desde el primer día** de la
  Fase 1.
- [Fuente](https://open-meteo.com/en/docs/historical-forecast-api)

## Cómo se mide la precisión
Para cada estación de INTA o del SMN y cada noche, se compara la probabilidad
pronosticada con lo observado (si heló o no a 5 cm y en abrigo). Las métricas:
- **Heladas detectadas** (POD) y **falsas alarmas** (FAR), para un umbral de
  aviso dado.
- **Brier score** y curva de confiabilidad: cuando la app dice 70 %, ¿heló
  alrededor del 70 % de las veces?
- **Error** de la mínima pronosticada frente a la observada.

Una regla nueva se acepta solo si mejora estas métricas frente a la anterior.

## Decisiones y por qué
- **Decisión:** usar como fuente bibliografía técnica citada y backtesting, en
  lugar de un agrónomo.
  **Por qué:** el proyecto no tiene un agrónomo. El usuario pidió que Claude
  investigara y asumiera ese rol.
  **Alternativas descartadas:** esperar a conseguir un agrónomo.
- **Decisión:** avisar la helada a nivel del suelo, no a 2 m.
  **Por qué:** el daño ocurre a ras del suelo, que en noches radiativas está
  de 3 a 6 °C más frío. Avisar con el dato a 2 m subestima el riesgo.
- **Decisión:** que todos los umbrales se puedan configurar y versionar.
  **Por qué:** casi la mitad de las reglas son inferencias que se van a ajustar
  con datos, y puede haber diferencias entre provincias.
- **Decisión:** que el lote guarde cultivo y fecha de siembra (opcionales).
  **Por qué:** sin el estado fenológico, el aviso de helada y de siembra solo
  puede ser genérico.
- **Decisión:** guardar los ensembles pronosticados desde el inicio.
  **Por qué:** Open-Meteo no archiva los miembros, y sin ellos no se puede
  validar la probabilidad.

## Huecos pendientes
- Umbrales de INTA para la temperatura de siembra de soja, girasol y trigo.
- Temperaturas letales en plántulas de soja y girasol.
- Textos de las normas provinciales de aplicación de agroquímicos.
- Confirmar el orden de las columnas de la Tabla 4.5 de la FAO.
- Confirmar los precios actuales de Open-Meteo (los últimos publicados son de
  2023).
- Términos de uso de INTA SIGA (CC BY-NC) para validar un producto comercial.

## Historial
- 2026-11-03: se crea a partir de la investigación de la Fase 0 (helada,
  pulverización, labores, siembra, cosecha y fuentes de datos).
