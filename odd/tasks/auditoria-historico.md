# Auditoría histórico — every lote keeps a complete, hourly, self-healing weather record for spray audits
Objective: /lotes/:id/historico always has the lote's hours, kept hour by hour, with wind, direction and the parameters a spray audit needs, at a bounded Open-Meteo cost.
Branch: `feat/cielo-animado` (continues; not pushed) · Delivery: ask-on-risk · Runners: pytest (backend/tests, in the container with `--ds=config.settings.test`); Vitest + Testing Library + MSW (frontend).

## Specs
- **S1 — Request** (L1, L2 verbatim):
  - "en /historico no esta guardando la info, la idea es que sea lo mas precisa que se guarde una auditoria completa del viento y de la direccion junto con parametros climaticos"
  - "haz cuantas llamadas necesites segun sea necesario para ser lo mas preciso posible con el clima sin descuidar el costo"
- **S2 — Coverage that heals itself** (`archiver.fetch_history`):
  - Runs every hour (minute 20), not once a day.
  - For every cell with a lote, it fetches from the local date of the cell's last stored hour (minus 1 day of overlap) through today, and upserts.
  - A cell with no stored hours gets the full `BACKFILL_DAYS` (90). So lotes created before history existed are filled, and any downtime is caught up on the next run.
  - A range longer than the API allows per request is split into chunks of at most `MAX_DAYS`.
  - Once a day (the run at 04:20 local), each cell also re-fetches the last `REFRESH_DAYS` (3) days, so provisional recent hours are revised.
  - One failing cell never stops the others; the run returns and logs `{"stored", "failed", "cells"}`.
- **S3 — Audit parameters** on `WeatherHour` (additive, nullable columns; existing rows untouched):
  - Already stored: temperature 2 m, humidity, dew point, precipitation, wind speed 10 m, wind direction 10 m, gusts 10 m.
  - New:
    - `temperature_80m_c` (`temperature_80m`), for thermal inversion;
    - `wet_bulb_c` (`wet_bulb_temperature_2m`), for Delta T;
    - `cloud_cover_pct` (`cloud_cover`);
    - `pressure_hpa` (`surface_pressure`);
    - `radiation_wm2` (`shortwave_radiation`).
  - The history API's hourly rows add these fields, plus derived:
    - `delta_t_c` = temperature − wet bulb (null if either is missing);
    - `inversion` = temperature_80m > temperature_2m (null if either is missing).
  - The daily summary rows add min humidity, max Delta T and the number of inversion hours.
- **S4 — /historico shows the audit:**
  - The hour-by-hour table adds humidity, Delta T and an inversion mark (an icon plus a word, never colour alone), next to wind, direction and gusts.
  - The existing columns stay; the help text and `Doc/funcionalidades/historico.md` explain the new fields and their source ("Datos de modelo de Open-Meteo, no medidos en el lote").
- **S5 — SMN observations** (`archiver.fetch_smn_observations`) run every hour instead of once a day, so a missed run is caught by the next one. Upsert by station and hour, as today.
- **S6 — Cost** (assumption, from L2), documented in `Doc/funcionalidades/historico.md`:
  - one request per lote cell per hour for at most 2 days and 12 variables, about 1.2 Open-Meteo calls each (fractional weight);
  - about 29 calls per cell per day; the 04:20 revision fits in that run's own request (4 days, still 1.2 calls) and adds no calls (corrected in L5);
  - the 90-day backfill only once per new cell.
  - Distinct cells, not lotes, drive the cost: lotes in one 0.1° cell share it.

## Tasks
| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S2, S3, S5, S6 | delegated (context backstop) | done | RED: 15 failed / 27 passed, then 1 (timezone) failed; GREEN: full backend suite 491 passed; real run in L4 and L5 |
| T2 | S3, S4 | delegated (context backstop, same writer after T1) | done | RED: 3 failed / 8 passed in `loteHistorico.test.tsx`; GREEN: 11 passed; full vitest 251 passed |

Route evidence: the Writer trigger fires on the context backstop (the parent session is past ~150k tokens); one writer runs T1 then T2, sequentially. Risk: item 1 (migration adding columns to stored data) and item 5 (paid external API usage). An independent verifier runs after the writer's checks.

## Log
- **L1** (2026-11-17, user, verbatim): "en /historico no esta guardando la info, la idea es que sea lo mas precisa que se guarde una auditoria completa del viento y de la direccion junto con parametros climaticos"
- **L2** (2026-11-17, user, verbatim): "haz cuantas llamadas necesites segun sea necesario para ser lo mas preciso posible con el clima sin descuidar el costo"
- **L3** (2026-11-17): reproduced in the Docker dev stack.
  - Of the lote cells, only 2 have `WeatherHour` rows. Lote 12's cell (−33.0, −61.2) has 0, and so do 4 others.
  - The last SMN `Observation` is from 2026-11-04.
  - Where history exists, wind direction and gusts are complete (0 nulls).
  - Causes:
    1. `fetch_history` runs once a day at 04:30 and only refreshes the last 3 days; a missed run is never caught up, and beat was not running at 04:30.
    2. `backfill_history` only runs when a lote is created or moved, so lotes older than the feature were never filled.
    3. Today's hours only appear the next day.
- **L4** (2026-11-17, writer, T1):
  - Implemented:
    - `fetch_history` runs hourly at minute 20 (`crontab(minute=20)`). Each lote cell goes from the local day of its last stored hour, minus `OVERLAP_DAYS` (1), through today.
    - A cell with no stored hours gets `backfill_range` (90 days).
    - The range is split by `history.chunks` into pieces of at most `MAX_DAYS`, oldest first.
    - The run where the local hour equals `REVISION_HOUR` (4, so the 04:20 run) also reaches back `REFRESH_DAYS`.
    - A cell stops at its first failed chunk, so no hole is left behind its last stored hour, and the other cells go on. The run returns `{"stored", "failed", "cells"}`.
    - SMN runs hourly at minute 10 (`crontab(minute=10)`).
    - `store_history` is still the only writer; `VALUE_FIELDS` carries the new columns into the upsert.
  - Open-Meteo variable names, all accepted by the real run: `temperature_80m`, `wet_bulb_temperature_2m`, `cloud_cover`, `surface_pressure`, `shortwave_radiation` (12 variables in total).
  - Migration `0003_weather_hour_audit`: 5 nullable `FloatField`s, applied to the dev DB; `makemigrations --check` is clean.
  - API additions:
    - each hour: the 5 new fields, `delta_t_c` and `inversion`;
    - each day: `humidity_min_pct`, `delta_t_max_c` and `inversion_hours` (null when no hour has both temperatures).
  - Call weight (S6): not returned by the API, so it is computed from https://open-meteo.com/en/pricing (fractional: variables / 10 × days / 14, each at least 1).
    - Hourly request: 2–4 days × 12 variables = 1.2 calls, so about 29 per cell per day.
    - The 04:20 revision asks for 4 days in the same request, so it adds no extra weight. This corrects the S6 assumption "plus the 3-day revision".
    - 90-day backfill: 91 days in 3 chunks = about 7.8 calls, the same as one long request.
  - Real `fetch_history` run in dev: `{'stored': 7457, 'failed': 0, 'cells': 7}` in about 7 s.
    - 5 empty cells got 2183 hours each, through 19:00 local today, with the audit columns filled.
    - The 2 cells that already had data caught up from their last hour.
    - Older rows keep null audit columns (existing rows untouched).
    - Estimated weight: 5 × 7.8 + 2 × 1.2 ≈ 41 calls.
  - Found and fixed in the tests:
    - `@respx.mock` on `TestHistoryTasks` turned the class into a function, so pytest never collected it (the backfill tests had never run). The fix is an autouse fixture with `with respx.mock:`.
    - The backfill test's payload started after the "already loaded" cut-off; it now answers from the requested start date.
  - Blockers, both outside the allowed surfaces:
    - `backend/tests/test_archiver_forecasts.py` line 213 asserts `smn["schedule"].hour == {3}`. S5 needs it to be hourly, for example `smn["schedule"].minute == {10}` and `smn["schedule"].hour == set(range(24))`.
    - `frontend/src/mocks/history.ts` (`demoHour`, `summarise`) builds `HistoryHour` and `HistoryDay`. The new required fields cannot typecheck without it, so T2 has not started.
  - Open: `build_request` sends no `timezone`, so Open-Meteo reads `start_date` and `end_date` as UTC days. Today's 21:00–23:00 local hours arrive only after local midnight, up to about 3 h late. Adding `"timezone": "America/Argentina/Buenos_Aires"` (timestamps stay UTC with `unixtime`) would align the days with local dates. This is not done: it changes the request for the backfill too and was not verified with a real call.
  - Checks:
    - `pytest -q --ds=config.settings.test`: 488 passed, 1 failed (above);
    - `ruff check . && ruff format --check .`: clean;
    - `makemigrations --check --dry-run`: no changes;
    - `npx vitest run`: 240 passed;
    - `eslint`: clean; `prettier --check`: clean;
    - `tsc -b`: only the pre-existing `src/sw.ts` errors.
- **L5** (2026-11-17, parent via writer): the user approved the surfaces `backend/tests/test_archiver_forecasts.py` and `frontend/src/mocks/history.ts`. The parent decided to send `timezone` in the history request.
  - T1 finished:
    - `test_beat_schedule` now pins SMN at minute 10, every hour.
    - `build_request` sends `"timezone": "America/Argentina/Buenos_Aires"` and keeps `timeformat=unixtime`.
    - New tests: the request carries the timezone, and `parse_hours` still yields UTC times (that one pins existing behaviour, so it was green from the start).
  - S6 corrected: the 04:20 revision asks for 4 days in that run's own request (1.2 calls), so it adds no calls.
  - Real `fetch_history` run with `timezone` at 20:28 local: `{'stored': 315, 'failed': 0, 'cells': 7}`.
    - 315 = 7 cells × 45 hours, from 00:00 local yesterday through 20:00 local today, so the days are now local.
    - Lote 12's cell (−33.0, −61.2) reaches 2026-11-17 23:00 UTC = 20:00 local, the current hour, with the audit columns filled (wet bulb 18.0, 80 m 26.3).
    - Worker and beat were restarted again, so the scheduled runs load the new request.
  - T2:
    - Types: `HistoryDay` and `HistoryHour` gain the S3 fields.
    - The mock generator (`mocks/history.ts`) produces them, with inversions on night hours.
    - Daily table: adds "Humedad mín", "Delta T máx" and "Horas con inversión".
    - Each hour: adds "Delta T" and "Inversión térmica", next to wind, gust, direction and humidity (moved up beside them). The mark reuses the `.level` chip, with an icon and a word: "Hay inversión" or "Sin inversión"; "—" when unknown.
    - A help line explains Delta T and the inversion. The existing attribution keeps "no medidos en el lote".
    - The facts grid min width went from 6.5rem to 7.5rem, so the chip fits.
    - Cloud cover, pressure and radiation are in the API but not on the page; S4 does not ask for them.
  - Checks:
    - `pytest -q --ds=config.settings.test`: 491 passed;
    - `ruff check . && ruff format --check .`: clean;
    - `makemigrations --check --dry-run`: no changes;
    - `npx vitest run`: 27 files, 251 passed (no flakes);
    - `eslint src`: clean; `prettier --check src`: clean;
    - `tsc -b`: only the 12 pre-existing `src/sw.ts` errors.
