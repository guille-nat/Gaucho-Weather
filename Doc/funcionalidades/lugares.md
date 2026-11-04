# Lugares (búsqueda y ubicación inversa)
> Última actualización: 2026-11-03

## Qué hace
Permite buscar una localidad o paraje de Argentina por nombre y saber qué lugar
corresponde a unas coordenadas. Alimenta la pantalla de inicio "clima primero"
(S8): el buscador y el nombre del lugar del [pronóstico público](pronostico.md).
Es público, no necesita cuenta.

## Cómo funciona
- App `backend/apps/places/`:
  - `georef.py`: cliente de Georef AR. Traduce sus respuestas a
    `{name, region, lat, lon}`; el resto de la app no conoce el formato de Georef.
  - `service.py`: ranking, deduplicado y caché.
  - `http.py`: lectura de `lat`/`lon` con los límites de Argentina, compartida
    con el pronóstico público.
- `GET /api/lugares/?q=<texto>` → `[{name, region, lat, lon}]`, hasta 8.
  - `q` con menos de 2 caracteres (sin contar espacios): 400
    `{"detail": "Escribí al menos 2 letras para buscar."}`.
  - Consulta `localidades` de Georef (hasta 30), descarta lo que cae fuera de
    los límites de Argentina, ordena primero el nombre exacto y después los que
    empiezan con el texto (sin distinguir tildes ni mayúsculas), saca duplicados
    por nombre y región y se queda con 8.
  - `region` es la provincia, precedida del departamento cuando aporta algo:
    `"General López, Santa Fe"`, pero `"Santa Fe"` para Rosario (departamento
    Rosario).
  - `lat`/`lon` son el centroide de la localidad, con 4 decimales.
- `GET /api/lugares/reverso/?lat=&lon=` → `{name, region}` o `null`.
  - Consulta `ubicacion` de Georef. `name` es el municipio; en zona rural, donde
    no hay municipio, es el departamento. Sin provincia responde `null`.
  - Coordenadas faltantes o no numéricas: 400
    `{"detail": "Indicá lat y lon como números."}`. Fuera de Argentina: 400
    `{"detail": "Por ahora solo cubrimos Argentina."}`.
- Si Georef falla: 503 con `{"detail": "No pudimos buscar lugares. Probá en un
  rato."}` (búsqueda) o `{"detail": "No pudimos ubicar el lugar. Probá en un
  rato."}` (reverso). En el pronóstico público, una falla deja `place: null` y
  el pronóstico igual responde.
- **Caché:** caché de Django (Redis), `PLACES_CACHE_SECONDS` (1 día por defecto).
  La búsqueda se guarda por el texto normalizado (minúsculas, sin tildes ni
  espacios de más). El reverso se guarda por coordenadas redondeadas a 0,001°
  (~100 m), que son las que se mandan a Georef. Las fallas no se guardan; un
  `null` legítimo sí.
- **Límite:** throttle por IP con el scope `places`, compartido por los dos
  endpoints: `THROTTLE_PLACES_RATE` (300/hora por defecto).

## Decisiones y por qué
- **Decisión:** Georef AR (`https://apis.datos.gob.ar/georef/api`), del
  Gobierno argentino, como proveedor de lugares.
  **Por qué:** sus términos permiten el uso comercial. En
  <https://datosgobar.github.io/georef-ar-api/terms/> (consultado el
  2026-11-03): "Los datos del Servicio de Normalización de Datos Geográficos de
  Argentina se disponibilizan bajo la licencia Creative Commons Attribution 4.0
  y pueden ser usados para cualquier fin, incluyendo fines comerciales." Además
  es la nomenclatura oficial (localidades del BAHRA, departamentos y municipios)
  y cubre solo Argentina, que es lo que pide S10.
  **Atribución:** CC BY 4.0 pide citar la fuente. Queda pendiente mostrar
  "Lugares: Georef AR (datos.gob.ar), CC BY 4.0" en la pantalla de créditos o
  en el pie del buscador.
  **Límites:** la misma página dice: "La API del servicio de normalización se
  encuentra en estado alpha de desarrollo y las cuotas de uso abierto sin
  autenticación no están definidas." Las cabeceras observadas el 2026-11-03
  fueron `x-ratelimit-limit-second: 200`, `-minute: 6000` y `-day: 3000000`.
  Por eso se cachea un día y se limita por IP.
  **Alternativas descartadas:** Nominatim (la política
  <https://operations.osmfoundation.org/policies/nominatim/> exige como máximo
  1 pedido por segundo y prohíbe el autocompletado mientras se escribe en el
  servicio público) y Photon de Komoot (servicio público de uso justo, sin
  garantías para producción).
- **Decisión:** el backend hace de intermediario en vez de llamar a Georef
  desde el navegador.
  **Por qué:** permite cachear para todos los usuarios, limitar por IP y
  cambiar de proveedor sin tocar el frontend.
- **Decisión:** el reverso nombra el municipio o, si no hay, el departamento.
  **Por qué:** `ubicacion` de Georef no devuelve la localidad, solo provincia,
  departamento y municipio. En el campo el municipio suele ser null.
- **Decisión:** pedir 30 resultados a Georef y quedarse con 8.
  **Por qué:** Georef devuelve duplicados (por ejemplo, dos "Córdoba" de la
  Capital, una entidad y un componente de localidad compuesta) y su orden no
  siempre pone primero el nombre exacto.

## Cómo modificarlo
- **Limitación conocida:** Georef busca por palabras completas, con algo de
  tolerancia. "venad" encuentra "Venado Tuerto", pero "rosa" no encuentra
  "Rosario" (sí "rosar"). El frontend debería buscar con unos milisegundos de
  espera mientras se escribe, y no asumir que cualquier prefijo funciona.
- Cambiar de proveedor: reescribir `georef.py` manteniendo `localidades()` y
  `ubicacion()` con la misma salida, y `PlacesUnavailable` para las fallas.
- La URL se cambia con `GEOREF_API_URL`.
- Tests: `backend/tests/test_places.py` (Georef simulado con respx).

## Historial
- 2026-11-03: versión inicial (feature `clima-y-fileteado`, T5).
