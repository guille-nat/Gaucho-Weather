# Plan de reescritura de Gaucho Weather
> Última actualización: 2026-10-16

## Qué es
El plan para rehacer Gaucho Weather desde cero como producto real para
productores agropecuarios argentinos, con la precisión como prioridad.

**La idea en una frase:** "Te decimos qué hacer hoy en tu campo, y te avisamos
antes de que sea tarde."

## Diagnóstico de la versión actual
- La infraestructura está bien resuelta: configuración por entorno, caché
  explícito por vista, JWT con rotación, throttling, Docker y CI.
- El núcleo del producto no existe: `PRODUCT.md` promete responder decisiones
  ("¿hiela esta noche?", "¿puedo pulverizar?"), pero la app muestra datos de
  clima, gráficos y reportes.
- El riesgo de helada es una suma de puntos sin fundamento, calculada con un
  solo proveedor. Además tiene un bug: `calculate_frost_probability` lee
  `dewPoint`, `cloudCover` y `sleetIntensity`, pero el pronóstico diario de
  Tomorrow.io trae `dewPointAvg`, `cloudCoverAvg` y `sleetIntensityAvg`, así que
  3 de sus 6 entradas se ignoran. Una helada de radiación típica (0 °C, cielo
  despejado y aire seco) da 50% en vez de 85%.
- El frontend tiene una carrera al renovar el JWT: con `BLACKLIST_AFTER_ROTATION`,
  varios pedidos que renuevan al mismo tiempo terminan en logout.

## Decisiones y por qué
- **Decisión:** reescribir desde cero, con repo nuevo y posibilidad de cambiar el stack.
  **Por qué:** decisión del usuario, para lograr un producto de calidad.
  **Alternativas descartadas:** rehacer solo el dominio y el front manteniendo la
  infra, o refactorizar de a poco. Claude recomendaba la primera; el usuario
  eligió empezar de cero.
- **Decisión:** el objetivo es un producto real con usuarios, no un portfolio.
  **Por qué:** decisión del usuario. Por eso pesan la precisión, el costo de
  las APIs y el canal de las alertas.
- **Decisión:** el MVP responde helada, pulverización, labores/siembra y clima general.
  **Por qué:** el usuario quiere una herramienta de calidad para el productor,
  lo más precisa posible.
- **Decisión:** las alertas llegan por push (PWA) y WhatsApp; el email deja de
  ser el canal principal.
  **Por qué:** el productor de 45 a 70 años lee WhatsApp, no el mail.
- **Decisión:** la unidad del producto es el **lote** (campo con coordenadas),
  no la ciudad.
  **Por qué:** consultar por ciudad no es hiperlocal; las decisiones dependen
  del lugar exacto.
- **Decisión:** construir por fases en lugar de las cuatro decisiones en paralelo.
  **Por qué:** cada decisión necesita sus propias reglas, validación y tests.
- **Decisión:** la zona inicial es el sur de Santa Fe, en la zona núcleo.
  **Por qué:** decisión del usuario. Ahí se calibran Δ (la diferencia entre la
  temperatura en abrigo y la del suelo) y la corrección de sesgo, y se arma el
  set de heladas observadas para el backtesting.
  **Alternativas descartadas:** toda la Pampa Húmeda. Abarca demasiada
  variedad de suelos y climas para una primera calibración.
- **Decisión:** el backtesting arranca con datos propios: pronósticos guardados
  desde la Fase 1 y observaciones horarias del SMN. El pedido a INTA queda para
  más adelante.
  **Por qué:** decisión del usuario. Los datos propios y los del SMN
  (CC BY 2.5 AR) se pueden usar comercialmente; los de INTA SIGA
  (CC BY-NC) requieren un acuerdo.
  **Consecuencia:** durante la primera temporada Δ se calibra solo contra la
  mínima en abrigo. Para validar a nivel del suelo hace falta la mínima a 5 cm
  de INTA.
- **Decisión:** pagar Open-Meteo por etapas.
  - **Desarrollo y backtesting:** plan gratuito con ensembles, USD 0 (la
    licencia permite evaluación y prototipos).
  - **Beta:** plan Standard, USD 29/mes. Como no incluye ensembles, la
    probabilidad sale del acuerdo entre modelos deterministas (ECMWF, GFS e
    ICON).
  - **Con ingresos:** plan Professional, USD 99/mes, con ensembles.

  **Por qué:** al principio habrá pocos usuarios pagos o ninguno. Y como el
  adaptador `ProveedorClima` aísla el motor, cambiar de etapa no lo afecta.
  **Alternativas descartadas:**
  - Pagar Professional desde el lanzamiento: costo fijo sin ingresos.
  - Instalar Open-Meteo en un servidor propio: suma operar la descarga y el
    procesamiento de GRIB, que no aporta valor al productor. Se reconsidera
    cuando el costo pese.

## Cómo lograr precisión
- **Varios modelos meteorológicos:** Open-Meteo expone ECMWF, GFS, ICON y sus
  *ensembles*. La probabilidad sale de la proporción de corridas que dan
  helada, no de un puntaje.
- **Variables agrícolas:** temperatura a 0 cm y del suelo, viento a 10 m,
  humedad, evapotranspiración y humedad del suelo.
- **Backtesting:** un set de heladas observadas (estaciones del SMN o del INTA)
  para medir aciertos, heladas no detectadas y falsas alarmas. Sin esa métrica
  no se puede afirmar que la app es precisa.
- **Validación agronómica:** umbrales (delta T, viento para pulverizar, suelo
  transitable) tomados de bibliografía y validados por un ingeniero agrónomo,
  documentados con su fuente.
- **Más adelante:** que el productor reporte si heló o no, para recalibrar por zona.

## Fases
| Fase | Contenido | Para qué |
|---|---|---|
| **0. Investigación** (1–2 sem) | Fuentes de datos, reglas con el agrónomo, set de heladas observadas | Definir con números qué es "preciso" |
| **1. Base** | Repo nuevo, CI, Docker, login, lotes con ubicación, PWA que funcione con mala señal | Estructura sobre la que va todo lo demás |
| **2. Clima + Helada** | Motor de decisiones v1, pantalla "hoy en tu lote", alertas push | Primer valor real y lo que distingue a la app |
| **3. WhatsApp** | Alertas con plantillas de Meta y aceptación explícita del usuario; quizás login con código por WhatsApp | Llegar al productor mayor |
| **4. Pulverización** | Ventanas horarias según delta T, viento, inversión térmica y lluvia próxima | Decisión diaria |
| **5. Labores/siembra** | Lluvia acumulada, humedad del suelo, piso transitable | La decisión más compleja |
| **6. Técnico** | Históricos, reportes, exportación | Usuario secundario |

## Arquitectura propuesta
- **Motor de decisiones:** paquete Python puro, sin Django. Recibe datos
  meteorológicos ya normalizados y devuelve la decisión con su explicación
  ("No pulverices de 14 a 18 h: viento de 22 km/h"). Tiene tests completos y
  se usa también para el backtesting.
- **Adaptadores de datos:** interfaz `ProveedorClima`, con Open-Meteo como
  fuente principal, para poder cambiar o combinar proveedores sin tocar el motor.
- **Backend:** Django + DRF, más Celery + beat (o un worker simple) que
  precalcula las decisiones de cada lote y dispara las alertas. El usuario lee
  un resultado ya calculado: es rápido y se hacen menos llamadas a la API.
- **Base:** Postgres con lotes, decisiones calculadas, alertas enviadas (con
  control de duplicados) y observaciones para recalibrar.
- **Frontend:** React + Vite como PWA, con TanStack Query para pedir datos y
  guardar la última respuesta cuando no hay señal, y Web Push.
- **Notificaciones:** un servicio con distintos canales (push, WhatsApp) y
  preferencias por usuario y por tipo de alerta.

## Qué se rescata de la versión actual
Ideas, no código:
- `PRODUCT.md`: usuarios, principios de diseño y accesibilidad.
- La separación de la configuración por entorno.
- El criterio de caché explícito y de seguridad (`SECURITY.md`).
- El control de duplicados de las alertas (registrar primero y enviar después,
  con una restricción única en la base).

## Preguntas abiertas
- ~~¿Hay un ingeniero agrónomo que pueda validar las reglas?~~ No hay. Las
  reglas salen de bibliografía citada y se validan con backtesting; ver
  [reglas-agronomicas.md](reglas-agronomicas.md) (2026-11-03).
- ¿Qué presupuesto hay? Lo de Open-Meteo quedó resuelto (pago por etapas,
  ver Decisiones). Falta definir el costo de WhatsApp, que cobra por mensaje.
- ¿Cómo se cobra: gratis, freemium o por lote?
- ~~¿Cuál es la zona inicial para validar con estaciones?~~ El sur de Santa Fe,
  en la zona núcleo (2026-11-03). Ver Decisiones.

## Historial
- 2026-11-03: se responde la pregunta sobre el agrónomo y se agregan las
  reglas de la Fase 0 en `reglas-agronomicas.md`.
- 2026-10-16: se crea el plan a partir del análisis del proyecto actual y de
  las decisiones del usuario.
