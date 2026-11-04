# Phase 1 — Foundation
Objective: new repo with CI, Docker, login, fields ("lotes") with location, an offline-capable mobile-first PWA, and forecast/observation archiving from day one.
Branch: `feat/phase-1-foundation` · Delivery: ask-on-risk (forecast > 400 lines; chain strategy pending) · Test runners: pytest (backend), Vitest + Playwright (frontend).

## Specs
- **S1 — Phase 1 scope** (from `Doc/plan-reescritura.md`, Fases): "Repo nuevo, CI, Docker, login, lotes con ubicación, PWA que funcione con mala señal".
- **S2 — Design process** (L1): "usa todas las skills que tenes a disposicion de diseño en la config global".
- **S3 — Mobile first** (L1): "recorda que es movile first". The primary user is on a phone, outdoors, in full sun, one-handed (PRODUCT.md).
- **S4 — Field data model** (from `Doc/reglas-agronomicas.md`, Decisiones): a field stores its exact location; crop and sowing date are optional.
- **S5 — Archive from day one** (from `Doc/plan-reescritura.md`, Decisiones): "el backtesting arranca con datos propios: pronósticos guardados desde la Fase 1 y observaciones horarias del SMN".
  - Assumption: the archive covers the field grid cells plus the SMN reference stations Rosario, Venado Tuerto and Marcos Juárez Aero.
- **S6 — Auth** (assumption, open to change): email and password with server-side session cookies (httpOnly, CSRF).
  - Why: avoids the JWT refresh race of v1.
  - Phone or WhatsApp code login stays for Phase 3.

- **S7 — Visual direction** (user, verbatim): "quiero una mezcla entre plano catrastal y canon".
  - The contract is in `.impeccable/surfaces/frontend-src-pages-mislotes-tsx.md`.
- **S8 — API contract** (decided by the parent; the frontend and backend units build against it):
  - **General:**
    - Everything is served under `/api/`, same-origin. In dev, Vite proxies `/api` to the backend; in prod, nginx does.
    - JSON only. Errors use `{"detail": "<message in Spanish>"}` or DRF field errors `{"<field>": ["..."]}`.
  - **Auth:** Django session cookie plus CSRF. The client sends the `X-CSRFToken` header on unsafe methods.
    - `GET /api/auth/csrf/` → 204 and sets the `csrftoken` cookie.
    - `POST /api/auth/register/` `{email, password, name}` → 201 `User`, and the user is logged in.
    - `POST /api/auth/login/` `{email, password}` → 200 `User`. Bad credentials → 400 `{"detail": "Email o contraseña incorrectos."}`.
    - `POST /api/auth/logout/` → 204.
    - `GET /api/auth/me/` → 200 `User` when logged in, or 403 when anonymous.
    - `User` = `{id, email, name}`.
    - Sessions last 60 days and renew on activity.
    - Login and register are throttled.
  - **Lotes:** each user sees only their own.
    - `GET /api/lotes/` → `Lote[]`, ordered by name.
    - `POST /api/lotes/` → 201 `Lote`.
    - `GET`, `PATCH` and `DELETE` on `/api/lotes/{id}/`. Another user's lote → 404.
    - `Lote` fields:

      | Field | Type | Rules |
      |---|---|---|
      | `id` | int | |
      | `name` | str | Required, max 80 |
      | `establishment` | str | Optional, the "campo" |
      | `locality` | str | Optional |
      | `latitude` | decimal | Required, −56..−21 |
      | `longitude` | decimal | Required, −74..−53 |
      | `crop` | enum or null | `soja`, `maiz`, `trigo`, `girasol`, `cebada`, `sorgo`, `otro` |
      | `sowing_date` | date or null | |
      | `area_ha` | decimal or null | |
      | `boundary` | GeoJSON Polygon or null | |
      | `summary` | object or null | Read-only, see below |
      | `created_at`, `updated_at` | datetime | |

  - **`summary`:** computed from the latest archived deterministic forecast for the lote's grid cell, or null if there is none yet. Shape: `{tonight_min_c_2m, tonight_min_models: {model: value}, fetched_at}`.
    - It is a plain forecast value, never a decision. Decisions arrive in Phase 2.
  - **Health:** `GET /api/health/` → `{"status": "ok"}`.
- **S9 — Archiver:**
  - **Forecasts** (Celery beat, every 6 h): for each distinct grid cell, fetch Open-Meteo.
    - Grid cells are the lotes' coordinates rounded to 0.1°, plus the SMN Rosario, Venado Tuerto and Marcos Juárez Aero stations.
    - Fetch the deterministic models `ecmwf_ifs025`, `gfs_seamless` and `icon_seamless`, plus the ensembles `ecmwf_ifs025` and `gfs025`.
    - Use hourly variables from `Doc/reglas-agronomicas.md`.
    - Store the raw payload in JSONB with the model, the kind and `fetched_at`.
  - **Observations** (daily task): download the previous day's SMN `datohorario` file and store the rows of those three stations.
  - Both tasks are idempotent and tolerate network failure: they log and retry the next run, without crashing the worker.

## Tasks
| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S2, S3, S7 | inline | done | Direction contract written to the surface brief; DESIGN.md is written at finish |
| T2 | S1 | delegated (unit A: parallel writer) | in progress | Docker Compose, CI, backend scaffold |
| T3 | S1, S4, S6, S8 | delegated (unit A) | in progress | Backend: auth and lotes API |
| T4 | S5, S9 | delegated (unit A) | in progress | Backend: archiver |
| T5 | S1, S2, S3, S4, S6, S7, S8 | delegated (unit B: parallel writer) | in progress | Frontend PWA |
| T6 | S1 | pending | pending | Doc/ updated per feature |

## Log
- L1 (2026-11-03, user, verbatim): "si arranca y usa todas las skills que tenes a disposicion de diseño en la config global, recorda que es movile first"
- L2 (2026-11-03): repo created at `~/workdir/programming/gaucho-weather-v2`.
  - The name was chosen by Claude because the user did not give one; it can be renamed.
  - `Doc/` and `PRODUCT.md` were copied from v1, with Product Purpose updated.
- L3 (2026-11-03): Impeccable direction roll for the Operate mode surface "Mis lotes".
  - Assigned: "Catálogo de remate". Pick: "Ruta nacional". Competitive challenger: "Banda amarilla". Canon offered.
  - Decision page served; waiting for the user's choice.
- L4 (2026-11-03): the user discarded three rolls and chose verbatim "quiero una mezcla entre plano catrastal y canon".
  - The direction contract was written to the surface brief.
  - Initial commit ec22fb4 on `main`, then the branch was created.
- L5 (2026-11-03): unit A (backend) returned.
  - Results: 70 tests pass, ruff is clean, `docker compose config` passes, and health returns ok on host port 8001. The live archiver stored 15 snapshots and 159 SMN rows.
  - The writer admitted that most of the work was not test-first. It compensated with three deliberate breakages, and the related tests caught each one.
  - Risk: items 2 (auth) and 5 (CI and Docker). An independent verifier was launched.
  - Contract clarifications were relayed to unit B:
    - decimals are JSON numbers;
    - CSRF is required on login and the token rotates;
    - `PUT` returns 405;
    - dev port 8001;
    - CI scripts are `lint`, `typecheck`, `test` and `build`.
  - Ops notes:
    - Set `TRUSTED_PROXY_COUNT=2` on the VPS.
    - The archive uses about 425 kB per cell per run, roughly 6 GB a year with 10 cells.
- L6 (2026-11-03): backend verifier verdict.
  - S1, S4, S5, S6 and S9 pass. S8 had two blockers:
    - **B1:** `NUM_PROXIES ... or None` made the throttle trust a spoofed X-Forwarded-For.
    - **B2:** `crop: ""` was stored as an empty string.
  - One correction batch fixed B1 and B2 and three advisories:
    - a huge decimal returned 500 instead of 400;
    - prod `TRUSTED_PROXY_COUNT` now defaults to 2;
    - the prod frontend port is bound to 127.0.0.1.
  - The probes are committed as `backend/tests/test_regressions.py`. B1 shows RED on the old setting and GREEN after the fix.
  - Backend: 85 tests pass and ruff is clean.
- L7 (2026-11-03): unit B (frontend) returned.
  - Lint, typecheck and build pass, plus 25 tests.
  - `nginx -t` passed when run by the parent; `docker compose config` passes.
  - Deviation: the bottom nav has 3 tabs (Lotes, Alertas, Perfil), because Phase 1 has no forecast screen.
  - Commits: 5c12117 (backend, T2–T4) and a64d44a (frontend, T5).
  - Launched in parallel: the Impeccable finish review, and a frontend verifier for risk items 1 (IndexedDB) and 2 (CSRF client).
