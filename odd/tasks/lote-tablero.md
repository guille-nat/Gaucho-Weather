# lote-tablero

Objective: the lote page (`/lotes/:id`) becomes a decision board for a farmer and an agronomist: today's decisions first with their evidence, the forecast's date visible, the spraying detail hour by hour, the static lote data folded away.
Branch: `feat/cielo-animado`. Delivery: ask-on-risk, stacked-to-main. Runner: backend `docker compose exec -T backend sh -c 'ruff check . && ruff format --check . && python manage.py makemigrations --check --dry-run && pytest -q'`; frontend `docker compose exec -T frontend sh -c 'npx tsc --noEmit -p . && npx eslint src --max-warnings 0 && npx prettier --check src && npx vitest run'` (known failure: `terminos.test.tsx > shows the same version as the backend`, container mount only).

## Specs

User's request (L1), verbatim: "http://127.0.0.1:5173/lotes/11 me parece que no es tan util la dispocicion con lo que se enseñan los detalles del lote, pensa en un productor o en un ingeniero". User's scope (L2): "Todo junto" (the layout and the new backend data in one feature).

**S1 — Hourly spraying data (backend, contract for S2–S5).** The lote forecast's `hourly[]` items gain:
- `wind_direction_deg`: number or null (degrees the wind comes from, 10 m), from the same forecast source as wind speed. A new stored field and its fetch.
- `spray`: `{level: "ok"|"caution"|"critical", causes: string[], delta_t_c: number|null, inversion: boolean}` or null for an hour the engine does not rate. `level` and `causes` are exactly what `backend/engine/spray.py` `rate_spray_hour` returns for that hour (the same rules the "Pulverizar hoy" decision uses); `delta_t_c` rounded to 0.1; `inversion` true when the inversion rule fired.
- Existing fields and the existing `decisions` stay unchanged.

**S2 — Decisions first.** Right below a compact header (name, crop with sowing date, hectares, establishment, one edit pencil) and the forecast's date and time (from `fetched_at`, e.g. "Pronóstico jue 19 · 18:00 · 3 modelos"), the section "Hoy en este lote" lists the three decisions with the most urgent first (critical, then caution, then ok; ties keep frost, spraying, field work). The disclaimer about unvalidated estimates stays.

**S3 — Each decision shows its evidence.**
- Spraying: the verdict and window once (no repeated window line), plus wind and gust ranges over the window and the main cause when not ok.
- Field work: the rain outlook plus "cayeron N mm en 7 días" (`rain_past_7d_mm`).
- Frost: the ground estimate, and the 2 m value worded as the median of the models with the coldest model next to it, so it does not look like a contradiction with "Ver modelos".

**S4 — Hours table for the agronomist.** One row per hour with temperature, rain and probability, wind/gust with direction, humidity, and the spraying state (Delta T, inversion, causes) from S1; the spraying window is marked. "Ahora" becomes a compact one-line strip (temperature, sky, max/min, wind) plus the sun times.

**S5 — Static data and actions.** "Datos del lote" is folded (a disclosure) near the end; the Histórico link sits right after the 7 days, before the data and the credits; "Borrar lote" moves to the edit screen; the crop and the edit action appear once.

**S6 — Desktop.** At wide widths: decisions, the compact now strip and the sun on the left; the hours (with the window band) and the 7 days on the right; Histórico, lote data and credits at the bottom.

## Tasks
| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S1 backend: wind direction stored and fetched, hourly spray in the forecast payload | delegated writer (parallel units: disjoint backend surface) | done | 8557863 |
| T2 | S2–S6 frontend, built on the S1 contract through the mock | delegated writer (parallel units: disjoint frontend surface) | pending | |

Risk: none expected (adds fields, changes layout); the parent re-checks after both. One seam check (both suites) at the end.

## Log
- **L1** (2026-11-20): user's request (S above). A read-only critique (impeccable, rendered at 390 and 1280 px with lote 11's data) found: decisions start below the fold and in a fixed order; spraying repeats its window and shows no wind, gusts, Delta T or inversion; the 2 m frost value (median) looks contradictory next to "Ver modelos"; the evidence sits screens away from its decision; the forecast's time is at the bottom without its date (20 hours old in the sample); static data and "Borrar" outweigh the tools; the Histórico link sits after the credits. Screenshots in the session scratchpad.
- **L2** (2026-11-20): asked the scope; the user chose "Todo junto". The order "most urgent first" comes from the accepted proposal sketch.
- **L3** (2026-11-20): T1 done (8557863): every hourly item has `wind_direction_deg` and `spray` (`delta_t_c` rounded to 0.1). Backend 965 passed. Accepted deviations: (1) the wind direction was already fetched and stored in the raw forecast JSON, so no new field or migration was needed, and old forecasts return it too; (2) only daylight hours (sunrise ≤ hour < sunset, today and tomorrow) are rated, other hours get `spray: null`, and today's rated hours match "Pulverizar hoy"; (3) `inversion` is true for both "posible" and "probable", and the causes tell which; (4) `now` keeps `wind_dir_deg`.
