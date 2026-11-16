# Cuenta, planes y alertas — account management, three anchored plans with founders, and custom alerts
Objective: let the farmer manage their account, pick among three plans (first 100 are founders, free forever), and get their own per-lote alerts by push, email and an in-app inbox.
Branch: `feat/cuenta-planes-alertas` (from `main`) · Delivery: ask-on-risk · Runners: pytest (backend/tests); Vitest + Testing Library + MSW (frontend).

## Specs
- **S1 — Plans** (L1, L2 verbatim): "gestion de cuenta y planes de cuenta"; "Debe de haber 3 planes con uno en el medio, destacado como el preferido y uno muy caro y otro muy barato pero con limitaciones, lo que resuelve mas dolencia debe de ser el del medio para que se tienda a elegir".

  | Plan | Lotes | Rules | Channels | Extras |
  |---|---|---|---|---|
  | Básico | 2 | 3 | inbox + email, no push | — |
  | Productor (highlighted "Recomendado") | 15 | unlimited | push + email + inbox | — |
  | Empresa | unlimited | unlimited | push + email + inbox | priority support; WhatsApp in phase 3 |

  - No payment yet (decision L3); Mercado Pago comes in a later phase.
  - Limits, prices (ARS/month, seeded empty → "Precio a confirmar") and flags are editable in Django admin.
- **S2 — Founders** (L1 verbatim): "los primeros 100 usuarios seran founders y no se les cobrara nada".
  - The first 100 get Productor free, forever (decision L4). They carry a founder number (#N).
  - Race-safe numbering; deleted accounts never free up their slot.
  - Assumption: existing non-staff users are backfilled first, ordered by `(date_joined, id)`; staff never take a slot.
- **S3 — Trial** (decision L5): user 101 onward gets Productor for 30 days, then moves to Básico. A daily task moves expired trials and emails the user.
- **S4 — Limits:** creating a lote or an alert rule over the plan limit answers HTTP 402 `{"detail": "...", "code": "plan_limit"}` in Spanish. Never 403: `frontend/src/query/client.ts:7-9` treats a non-CSRF 403 as a lost session. Downgrade deletes nothing; creation is blocked and rules beyond the limit pause (`paused_by_plan`).
- **S5 — Account management** (L1 verbatim: "gestion de cuenta"; scope is an assumption from the approved plan):
  - edit name and email (email needs the current password);
  - change password;
  - password reset by email (token lasts 1 h, always answers 204, throttled);
  - delete account with password (cascades lotes, rules, events, subscriptions);
  - show plan, usage, founder badge and trial days left;
  - notification preferences (push on/off, email on/off).
- **S6 — Custom alerts** (L1 verbatim: "alertas personalizadas"; decision L6): the user writes their own rule per lote: variable (`frost`, `temp_min`, `temp_max`, `rain`, `wind`, `spray_window`) + comparator (`lt`, `lte`, `gt`, `gte`) + threshold, e.g. "avisame si la mínima baja de 2 °C en el lote Norte".
  - Evaluated on the archived consensus payload (`forecasts()`), after each forecast update, for the rest of today plus tomorrow.
  - Dedup: one event per `(rule, target_date)`.
- **S7 — Channels** (decision L7): Web Push (VAPID) + in-app inbox at `/alertas` + email. Push only for plans with `allows_push`. WhatsApp is out of scope.
- **S8 — Plans page:** public `/planes` with three cards, Productor in the middle and highlighted, the founder counter ("Quedan N lugares de founder"), the current plan marked, and "Próximamente" as the call to action.
- **S9 — Wind history per lote** (L17 verbatim): "hay que agregar un historico de vientos por lote para los aplicadores".
  - For each past hour of a lote: wind speed at 10 m, gusts, direction, plus temperature, humidity and rain (what an applicator needs to justify an application).
  - Each hour shows whether it was inside the spray wind range of the engine (`engine/config.py`), and the screen says the data is modelled, not measured on the lote.
- **S10 — Weather history per lote** (L17 verbatim): "un historico de clima por lote tambien".
  - Daily summary per lote: max, min, rain, max wind and max gust, over a chosen range.
- **S11 — Own dataset** (L18 verbatim): "el de openmetro y guardarlos nosotros en una db por las dudas que cambiemos de proveedor, la idea es hacer nuestra base de datos tambien aparte de nutrirnos de las existentes".
  - Source: Open-Meteo Historical Forecast API (verified in its docs: hourly from 2021, stitched from each run's first hours, tracks actual conditions). The commercial `customer-` prefix and API key work as for the forecast.
  - Stored in our own provider-independent table, per grid cell (0.1°, like the archiver), with a `source` column, so another provider can be added later without changing the API or the screen.
  - Assumptions: a new lote backfills 90 days; a daily task adds the last days, with overlap; one request covers up to 31 days; available on every plan.

## Tasks
| ID | Specs | Unit | Route | Risk | Status | Commit |
|---|---|---|---|---|---|---|
| T1 | S1 S2 S3 | Plans + founders + trial backend: models, migrations, backfill, signup, `/me`, `/api/planes/`, `expire_trials` | inline | item 1, 4 | done (verified) | see L9 |
| T2 | S4 S8 | Lote limit (402) + LoteForm message + `/planes` page | inline | none | done | see L10 |
| T3 | S5 | Account endpoints: PATCH/DELETE `/me`, password change, preferences | inline | item 1, 2 | done (verified) | see L11 |
| T4 | S5 | Email settings + password reset | inline | item 2 | done (verified) | see L12 |
| T5 | S5 | Frontend account: Perfil, reset pages | inline | none | done | see L14 |
| T6 | S6 S4 | Alert models + rules API + limit | inline | none | done | see L16 |
| T7 | S6 | Evaluator + `evaluate_rules` task + archiver hook | delegated (context backstop) | none | done | see L19 |
| T8 | S7 | Delivery push/email + inbox and push APIs | inline | item 3 | pending | |
| T9 | S7 | Service worker → injectManifest (no push yet) | inline | item 5, 6 | pending | |
| T10 | S6 S7 | Frontend push + `/alertas` page | inline | none | pending | |
| T12 | S9 S10 S11 | History backend: own hourly table, Open-Meteo historical fetch, 90-day backfill on lote create, daily task, `GET /api/lotes/{id}/historico/` | inline | none after review: new table only, no existing data changed; shared engine code covered by its tests | done | see L20 |
| T13 | S9 S10 | History frontend: lote "Histórico" view, daily summary and hourly wind with spray range | inline | none | pending | |
| T11 | all | Docs `Doc/funcionalidades/{planes,cuenta,alertas}.md` + updates | inline | none | pending | |

Route evidence: no Writer trigger reason (units are sequential and depend on each other), so the parent writes inline following this logbook. T1, T3, T4 and T9 get an independent verifier after their own checks.

Forecast: ~4000 authored changed lines → over the 400-line budget; ask-on-risk asks for the chain strategy before the PR.

## Log
- **L1** (2026-11-16, user, verbatim): "Hay que desarrollar dos nuevas funcionalidades, 1 alertas personalizadas, 2 gestion de cuenta y planes de cuenta, los primeros 100 usuarios seran founders y no se les cobrara nada"
- **L2** (2026-11-16, user, verbatim, plan review): "Debe de haber 3 planes con uno en el medio, destacado como el preferido y uno muy caro y otro muy barato pero con limitaciones, lo que resuelve mas dolencia debe de ser el del medio para que se tienda a elegir"
- **L3** (decision): "Planes sin cobro" — model plans and founders now; payment later.
- **L4** (decision): plan split "Reparto por canal y lotes" — Básico 2 lotes / 3 rules / no push; Productor 15 lotes / unlimited rules / push; Empresa unlimited + priority support. Founders get Productor.
- **L5** (decision): user 101+ gets "Prueba de Productor" — 30 days, then Básico.
- **L6** (decision): alerts are "Reglas propias por lote".
- **L7** (decision): channels "opcion 1 y 2" — push + inbox, and email.
- **L8** (2026-11-16): Step 0 done on `main`: `3e6a700` (map) and `02d0ed1` (brand). Map test made independent of the developer's `.env`. Branch created. Next: T1.
- **L9** (2026-11-16): T1 done.
  - Tests were written after the code, so I ran a mutation probe instead: without `select_for_update` the concurrency test fails 3/3.
  - pytest 224 passed (twice with --reuse-db), ruff clean, `makemigrations --check` clean, migrations 0005→0001→latest reversible on dev.
  - Dev DB backfill: the 3 existing users are founders #1–#3.
  - Independent verifier: S1, S2 and S3 pass, no blockers. Advisories fixed: `expire_trials` only touches Productor trials, the trial email reads the real limits, PlansView reads the founder row by pk=1.
  - Accepted: login, register and me share the extended `User` payload (additive fields).
  - Open advisories: admin-created users get Básico with no slot; `EMAIL_USE_TLS` accepts only "true"; a same-email race returns 500 (pre-existing).
  - `.env` is not readable by the agent (deny rule); defaults cover dev.
- **L10** (2026-11-16): T1 RDD review (risk, resilience, reliability) approved and acknowledged; reviewed boundary = `b8be0fe`.
  - Advisory R1-001: bots on many IPs could drain the 100 founder slots, because sign-up has no email verification. To raise with the user.
  - T2 done test-first. Backend RED: 3 failing limit tests. Frontend RED: 8 failing tests (planes page and 402 alert).
  - GREEN: pytest 229, Vitest 86, tsc, eslint and prettier all clean.
  - `/api/planes/` smoke-tested through the Vite proxy.
  - The 402 body is `{detail, code: "plan_limit"}`. `ApiError.code` and `isPlanLimit()` are on the client, and creating a lote invalidates `me` (usage).
- **L11** (2026-11-16): T3 done test-first (RED: 16 failing). Endpoints:
  - PATCH `/me` (name, email with `current_password`, `notify_*`; plan fields are read-only);
  - POST `/password/change/` (204, keeps this session, signs out the others);
  - DELETE `/me` (password, cascades lotes, logs out, founder slot not freed).
  - Password-checking methods share the login throttle bucket (10/min/IP); GET is never throttled. The throttle test caught a real bug: ScopedRateThrottle reads `view.throttle_scope`, not the class attribute.
  - pytest 248 passed. The independent verifier will run over T3 and T4 together (both item 2).
- **L12** (2026-11-16): T4 done test-first (RED: 10 failing). Endpoints:
  - POST `/password/reset/` always answers 204, needs CSRF, is throttled at 5/hour per IP, and sends the email from the Celery task `accounts.send_password_reset`.
  - POST `/password/reset/confirm/` takes uid, token and new password. The link lasts 1 h (`PASSWORD_RESET_TIMEOUT`) and works once; a bad or expired link answers `{"detail": "El enlace no es válido o venció. Pedí uno nuevo."}`. A reset signs out every session.
  - A login also spends pending links (Django's token includes `last_login`), now pinned by a test.
  - Email settings were already added in T1. pytest 259 passed.
- **L13** (2026-11-16): Independent verifier over T3 and T4: all S5 items and the S2 slot rule pass, no blockers.
  - Fixed: a logged-in PATCH revealed whether an email had an account before checking the password. The password is now checked first, and both orders are pinned by tests.
  - Fixed: name and preference PATCHes consumed the login throttle. Now only requests carrying a password count.
  - Open advisories: no notice to the old address on an email change; a same-email race returns 500 (as in register); a broker outage returns 500 on a reset request.
  - pytest 262 passed.
- **L14** (2026-11-16): T5 done test-first (RED: 11 failing).
  - Perfil is now the account page, with sections: Tu plan (usage, founder or trial line, Ver planes), Tus datos (name; email with the current password), Cómo te avisamos (push and email switches; push disabled on plans without it), Contraseña, and Borrar cuenta (inside a details element, password required, then login says "Borramos tu cuenta, sus lotes y sus alertas.").
  - New pages: `/recuperar` (same answer either way) and `/restablecer/:uid/:token` (a bad link offers "Pedir otro enlace"). Login links "¿Olvidaste tu contraseña?".
  - Vitest 97, tsc, eslint and prettier clean.
  - E2E on the dev stack: the reset request answered 204 and the Celery worker emailed the /restablecer link. The worker and beat were not running in dev and were started.
- **L15** (2026-11-16): RDD review of the slice b8be0fe..ba985f9 (risk, resilience, reliability; escalated item 2) was approved and acknowledged. The reviewed boundary is now `ba985f9`.
  - Warnings fixed test-first:
    - R1-001: a reset email goes to one address at most every 10 minutes, whatever the IP (`cache.add` per user).
    - R4-001: when the broker is down the reset request still answers 204 and logs the error.
  - pytest 264 passed.
- **L16** (2026-11-16): T6 done test-first (RED: the module could not import).
  - New app `apps.alerts` with models AlertRule, AlertEvent (`UniqueConstraint(rule, target_date)`) and PushSubscription; migration 0001.
  - `/api/alertas/reglas/` CRUD scoped to the owner. Validation per variable lives in `rules.validation_errors` and the Spanish description in `rules.describe`.
  - The 4th rule on Básico answers 402; rules beyond the cap after a downgrade report `paused_by_plan`; `usage` adds `alert_rules`. Deleting a lote cascades its rules.
  - pytest 290 passed.
- **L17** (2026-11-16, user, verbatim, mid-task): "hay que agregar un historico de vientos por lote para los aplicadores, un historico de clima por lote tambien"
- **L18** (2026-11-16, user, verbatim, answering the data source question): "el de openmetro y guardarlos nosotros en una db por las dudas que cambiemos de proveedor, la idea es hacer nuestra base de datos tambien aparte de nutrirnos de las existentes"
- **L19** (2026-11-16): T7 done by a bounded writer, delegated as the context backstop; parent spot check: pytest 323 passed.
  - RED: an ImportError before the code existed, and the hook tests failed with the hook blanked.
  - `apps/alerts/evaluate.py` reads the `forecasts()` payload for the future hours of today and tomorrow. Rain for tomorrow uses the daily value. The frost event is dated to the start of the night, so one night gives one event.
  - `alerts.evaluate_rules` (`run_evaluation`) groups rules by cell, skips forecasts older than `ALERTS_MAX_FORECAST_AGE_HOURS` (12), and uses `get_or_create(rule, target_date)`, so it is idempotent.
  - `fetch_forecasts` calls it through `.delay()`; a broker outage is logged and the archive run continues. The `evaluate_alerts` command runs it by hand.
  - Decision: disabled rules count toward the plan cap, consistent with the create limit ("Hasta 3 reglas").
- **L20** (2026-11-16): T12 done.
  - Storage: `WeatherHour` (provider-independent, per cell, with `source`, unique per hour) in archiver migration 0002.
  - `apps/archiver/history.py`:
    - fetch uses the Historical Forecast API with unixtime UTC and an upsert that revises recent hours;
    - `parse_range` validates `?desde=&hasta=` in Spanish, at most 31 days, starting no earlier than 2021-01-01;
    - `lote_history` returns days, hours, the per-hour `spray_wind` rating and a `complete` flag.
  - Engine refactor: the wind and gust bands moved to `engine.spray.wind_findings` and `rate_wind`, now shared by the spray verdict and the history; the engine tests still pass.
  - Tasks:
    - `archiver.fetch_history` runs daily at 04:30 over the last 3 days;
    - `archiver.backfill_history` loads 90 days, once per cell, queued on commit when a lote is created or moved (`HISTORY_BACKFILL_ON_CREATE`, off in tests);
    - a broker outage never fails a lote save.
  - The API reads only our table (architecture rule). pytest 340 passed.
  - Test-first was partial: the module and API tests failed before the settings existed (RED observed for fetch); the task tests were written alongside the code.
  - Real call on dev: lote 1's cell stored 2179 hours in one request.
  - Note: commercial use of the historical API needs the Open-Meteo Professional plan (memory #2061).
