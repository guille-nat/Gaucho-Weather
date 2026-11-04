# Clima y fileteado — forecast information, decisions v0 and the gaucho visual world
Objective: give the farmer the forecast information and work decisions they need per lote, in a gaucho-culture world with life and colour.
Branch: `feat/clima-y-fileteado` (from `feat/phase-1-foundation`) · Delivery: ask-on-risk · Runners: pytest; Vitest + Testing Library + MSW.

## Specs
- **S1 — Information** (L1, verbatim): "faltan metricas e info que ayude al productor poder tomar deciciones, oredicciones de lluvia, horarios, etc."
  Per lote, it means:
  - rain per day (mm and probability) for 7 days;
  - rain fallen over the last 7 days;
  - now (temperature, humidity, wind and gusts);
  - today's max and min;
  - sunrise and sunset;
  - hour by hour for 48 h (temperature, wind, gusts, rain and probability).
- **S2 — Identity** (L1, verbatim): "perdio toda la escencia lde agro argentino [...] es Gaucho Weather asi que tiene que representar eso en una cultura donde el gaucho es el representante del campo, le falta vida y color".
  - The direction "Fileteado criollo" was chosen on the decision page.
  - The contract is in `.impeccable/surfaces/frontend-src-pages-lotedetail-tsx.md`, and the approved composition is `.impeccable/mocks/decision/assigned-g.html`.
  - The whole app is restyled into this world: shell, Mis lotes, detail, form, auth, perfil and alertas.
- **S3 — Decisions v0:** a pure-Python engine (`backend/engine/`, no Django) implementing the rules of `Doc/reglas-agronomicas.md`, each verdict with its reason. Its outputs:
  - **Frost tonight:** ground estimate `Tmin_2m − Δ` (Δ 4 °C on radiative nights, 0.5 °C otherwise), with agreement across the deterministic models.
  - **Spray window today:** Delta T 2–8, wind at 2 m 5–15 km/h, gusts, inversion heuristic and rain in the window.
  - **Field work / next rain:** the next day with ≥ 5 mm (assumption) and its probability.
  - Every verdict carries `engine_version: "v0"` and `validated: false`.
  - The UI says so honestly: "Estimación con reglas publicadas; todavía sin validar en tu zona".
- **S4 — Probability:** rain probability is the fraction of ensemble members with ≥ 1 mm in the period, or null when no ensemble is archived. Frost agreement is "N de M modelos".
- **S5 — API contract** (new; it extends Phase 1's S8):
  - **Endpoint:** `GET /api/lotes/{id}/pronostico/` (own lotes only, else 404) → 200, or `{"detail": "Todavía no hay pronóstico para este lote."}` with 404 when nothing is archived. 200 body:
    ```
    {fetched_at, models: [str],
     now: {time, temperature_c, humidity_pct, wind_kmh, wind_dir_deg, gust_kmh},
     today: {max_c, min_c, sunrise, sunset},
     rain_past_7d_mm: number|null,
     daily: [{date, max_c, min_c, rain_mm, rain_probability_pct|null, sky: "sol"|"parcial"|"nublado"|"lluvia"|"tormenta"}] (7 items),
     hourly: [{time, temperature_c, humidity_pct, wind_kmh, gust_kmh, rain_mm, rain_probability_pct|null}] (next 48 h),
     decisions: {
       frost_tonight: {level, min_2m_c, ground_estimate_c, models_agreeing, reason},
       spray_today: {level, best_window: {start, end}|null, reason},
       field_work: {level, next_rain: {date, mm, probability_pct|null}|null, reason},
       engine_version: "v0", validated: false}}
    ```
    - `level` is one of `ok`, `caution`, `critical`.
    - Times are ISO 8601 in America/Argentina/Buenos_Aires.
    - Reasons are short Spanish sentences.
  - **Lote list:** `Lote.summary` gains `headline: {level, text}`, the most urgent decision for the card, or null.
- **S6 — Archiver:** the Open-Meteo requests add whatever S1 needs:
  - `past_days=7` for the rain that has fallen;
  - `daily=sunrise,sunset`;
  - hourly `precipitation`, `relative_humidity_2m`, `wind_direction_10m`, `cloud_cover`, `weather_code` where missing.
  - It stays idempotent.

## Tasks
| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S2 | inline | done | Direction chosen; contract written |
| T2 | S1, S3, S4, S5, S6 | delegated (unit A: parallel writer) | in progress | Backend: engine v0, forecast endpoint, archiver extension |
| T3 | S1, S2, S5 | delegated (unit B: parallel writer) | in progress | Frontend: fileteado world app-wide, Hoy en tu lote, Pronóstico tab |

## Log
- L1 (2026-11-03, user, verbatim): "primero perdiop toda la escencia lde agro argentino, faltan metricas e info que ayude al productor poder tomar deciciones, oredicciones de lluvia, horarios, etc. es Gaucho Weather asi que tiene que representar eso en una cultura donde el gaucho es el representante del campo, le falta vida y color"
- L2 (2026-11-03): PRODUCT.md updated.
  - The brand personality changed, and principle 5 was replaced: "Criollo y con color, sin perder el dato".
  - Principle 6 was added: "Información para decidir".
  - The decisions engine v0 is pulled forward from Phase 2 because the user asked for decision help now. It is labelled unvalidated until backtesting.
- L3 (2026-11-03): direction round on the screen "Hoy en tu lote". The user chose "Fileteado criollo" (seed:94aec30eb0f49ffe).
