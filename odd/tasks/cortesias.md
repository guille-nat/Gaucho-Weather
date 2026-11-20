# cortesias

Objective: a super admin gives a paid plan for free ("cortesía") to a few accounts as a hook, always with an end date at most one year away; the backoffice plan change can no longer give a paid plan for free.
Branch: `feat/cielo-animado`. Delivery: ask-on-risk, stacked-to-main. Runner: `docker compose exec -T backend pytest -q`; frontend `docker compose exec -T frontend npx vitest run` (plus `npx tsc --noEmit -p .`, `npx eslint src --max-warnings 0`, `npx prettier --check src`); backend `ruff check .`, `ruff format --check .`, `python manage.py makemigrations --check --dry-run`.

## Specs

User's request (L1), verbatim: "yo deberia como superadmin poder dar plan gratis o aceptar un plan gratis marcar, se le cobra o no, solo para algunos que tengo pensado para usarlos de enganche, de ultima ponerle fecha de caducidad de x tiempo no superiro a 1 año, que pensas, hay que tener en cuanta de no comprometer la seguridad"

User's decision (L2): "Cerrarlo (Recomendado)": "El cambio de plan del equipo solo permite bajar a Básico. Subir a un plan pago sin cobrar se hace solo como cortesía, con fecha ≤ 1 año, motivo y tope. Un solo camino, todo con vencimiento."

**S1 — Give a cortesía (backoffice API).**
- `POST /api/backoffice/cuentas/{id}/cortesia/` with `{plan, hasta, motivo}`; superuser only (the existing `BackofficeView` permission).
- `plan` is `productor` or `empresa`. `hasta` is a date after today (Buenos Aires) and at most 365 days after today: "no superiro a 1 año". `motivo` is required, non-blank, at most 200 characters.
- The account moves to that plan, free, until the end of `hasta` (Buenos Aires), like a trial's `plan_expires_at`. It is recorded as a PlanChange with a new reason `courtesy` ("cortesía") and a `BackofficeAction` `courtesy_grant` with `{plan, until, reason, from_plan}`.
- Refusals (400 with `{"detail": ...}` unless it is a field error), checked on the server:
  - a paying account (a running subscription, or a cancelled one still in its paid month): reuse `refuse_if_paying` in `backend/apps/backoffice/views.py`;
  - the super admin's own account: "No podés darte una cortesía a vos mismo.";
  - a founder asking for Productor (they already have it);
  - when 20 cortesías are already active: "Ya hay 20 cortesías activas. Revocá alguna antes de dar otra." (assumption: the cap is 20, a setting-free constant).
- Calling it again on an account with an active cortesía changes its plan or date, but the end can never be more than 365 days after the day the cortesía was first given (assumption: the year counts from the first grant, so it cannot be renewed forever).
- Rule from L5 ("1 año en 2 años"): in any window of 2 years (730 days) an account adds up at most 365 days of cortesía, counting every cortesía it had (revoked ones count up to their revoke, expired ones up to their end). A grant or re-grant that would exceed it is refused with the date it could end at most, or the day a new one becomes possible.
- The cap of 20 holds under concurrent grants (one shared lock before counting).

**S2 — Revoke.**
- `DELETE /api/backoffice/cuentas/{id}/cortesia/` ends an active cortesía now: the account goes to Básico, or to Productor for a founder. `BackofficeAction` `courtesy_revoke`. Without an active cortesía: 404.

**S3 — Expiry and emails.**
- The daily task that expires trials also ends cortesías whose date passed (Básico, or Productor for a founder), and emails the account that it ended with a link to subscribe (`/planes`).
- About 7 days before the end, one email invites the account to subscribe (assumption: 7 days; sent once per cortesía).
- If the account subscribes and a subscription becomes authorized during the cortesía, the cortesía ends without moving the plan (the payment flow already sets the plan).

**S4 — Close the free upgrade.**
- The backoffice plan change (`POST cuentas/{id}/plan/`, `AccountPlanView`) only allows moving to `basico`. Any other plan answers 400: "Para dar un plan pago sin cobrar, usá una cortesía." Moving to Básico ends an active cortesía.
- Accounts already on a paid plan with no end date are left as they are (no stored data is changed); the doc lists how to find them.

**S5 — Backoffice UI.**
- The account record (`frontend/src/pages/backoffice/cuenta/`) shows an active cortesía (plan, until when, reason) with "Revocar cortesía" behind a confirmation, and "Dar cortesía" (plan, date with `max` one year ahead, reason) in a dialog. The plan change form offers only Básico.
- Registro describes `courtesy_grant` and `courtesy_revoke` in words. The mocks in `frontend/src/mocks/backoffice.ts` follow the API.

**S6 — Security (from the user's "no comprometer la seguridad").**
- Every rule above is enforced on the server, never only in the UI; superuser only; every grant and revoke is in the backoffice log, which nobody edits.
- From the verifier's findings and the user's decision L2 ("Un solo camino, todo con vencimiento"):
  - No cortesía, trial or founder grant to a superuser account (yours or another's) or to a blocked account.
  - The backoffice trial grant ends at most 365 days ahead, like a cortesía.
  - In the Django admin, `plan` and `plan_expires_at` are read-only: plans change only through the backoffice, where every change is logged.
- Out of scope, recorded as a follow-up: two-step verification for super admins.

## Tasks
| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S1–S4, S6 backend (model, API, expiry, emails, closing the plan change) | delegated writer (context backstop: the parent session is long) | done | 96f80e3 |
| T2 | S5 frontend (and S6 in the UI) | delegated writer (same reason) | done | abd3941 |
| T3 | S1, S6 verifier blockers and hardening | delegated writer (context backstop) | done | 2a54254 |
| T4 | S4 plan change refuses paying accounts (L8) | delegated writer (context backstop) | pending | |

Risk: item 2 (permissions and guards: who can give a paid plan for free) and item 3 (changes the backoffice plan-change API, requested by the user). Independent verifier after T2.

## Log
- **L1** (2026-11-20): user's request, verbatim in S above.
- **L2** (2026-11-20): found that `AccountPlanView` already moves any account to a paid plan for free, with no end date, no cap and no paying check; `TrialView` gives Productor until a date with no maximum. Proposed one "cortesía" concept; the user chose "Cerrarlo (Recomendado)".
- **L3** (2026-11-20): T1 done in 96f80e3 (S1–S4, S6 backend). RED first: the 38 tests in `backend/tests/test_cortesias.py` and 4 new permission cases in `test_backoffice.py` failed before the code; all pass now. Checks: `docker compose exec -T backend sh -c 'ruff check . && ruff format --check . && python manage.py makemigrations --check --dry-run && pytest -q'` → ruff clean, 144 files formatted, no migration changes, 929 passed. Migrations `accounts/0012_courtesies` and `backoffice/0004_courtesy_actions`. `plans._switch` ends an active cortesía on any move that is not the cortesía itself (payment, staff, trial, founder, expiry). Record field for T2: `courtesy` = `{plan: {code, name}, starts_at, ends_at, reason, granted_by}` or `null`. `test_backoffice_accounts.py` gained `"courtesy": None` (approved). Deviations, accepted by the parent:
  1. A founder can still be moved to Productor through the plan change (their free plan); a founder asking for Empresa still gets "Como founder, Empresa se paga…".
  2. `subscribe` allows the same plan when the account has an end date, so a founder on an Empresa cortesía can pay Empresa.
  3. A re-grant that only changes the date writes no plan-change row, and the reminder goes out once per cortesía.
  4. Revoking sends no email.
- **L4** (2026-11-20): T2 done in abd3941 (S5, S6 in the UI). RED first: the 13 tests in `frontend/src/test/cortesias.test.tsx` failed before the code (the user-history one checked separately); all pass now. Two existing tests that moved Marta to Empresa through "Cambiar plan" now move Juan down to Básico. With the parent's approval, `founder-upgrade.test.tsx` now asserts that "Cambiar plan" offers a founder only Básico and Productor and sends nothing (the backend tests cover the refusal), and `PlanChangeReason` in `api/types.ts` gained `courtesy` and `courtesy_ended`. The user's plan history in `Suscripcion.tsx` says "Empezó tu cortesía" and "Terminó tu cortesía", in the second person like its other entries. Check: `docker compose exec -T frontend sh -c 'npx tsc --noEmit -p . && npx eslint src --max-warnings 0 && npx prettier --check src && npx vitest run'` → tsc, eslint and prettier clean; 365 passed, 1 failed: the known `terminos.test.tsx > shows the same version as the backend` (the container mounts only ./frontend). Deviations accepted by the parent:
  1. With an active cortesía the button reads "Cambiar cortesía" and the dialog starts from its plan, date and reason (the re-grant of S1).
  2. "Dar cortesía" is not hidden on the super admin's own account: the server refuses it and the dialog shows the refusal.
- **L5** (2026-11-20): independent verifier: S2–S5 pass; S1 and S6 fail. Blockers: (1) two concurrent grants at 19 active leave 21 (`len()` of a `select_for_update` list does not see rows committed meanwhile); (2) revoke (or expiry) then a fresh grant starts another full year. Advisories: the trial grant gives Productor until 2099 even to oneself; the Django admin edits plan and expiry without a log; founder self-grant; super admins can give each other cortesías; a blocked account can get one. User's decision for (2): "1 año en 2 años (Recomendado)": "En cualquier ventana de 2 años una cuenta suma como máximo 365 días de cortesía." S1 and S6 rewritten; T3 opened for the correction batch.
- **L6** (2026-11-20): T3 done in 2a54254 (S1, S6). Each new grant takes one shared `pg_advisory_xact_lock` and then counts again in a new query, so the cap holds; the verifier's race probe is now a `transaction=True` test asserting 20 active and the cap refusal. "1 año en 2 años": no 730-day window holds more than 365 days of cortesía (revoked up to the revoke, expired up to the end, active up to `hasta`, Buenos Aires days); refusals "Una cuenta suma como máximo un año de cortesía cada 2 años: esta puede terminar como máximo el DD/MM/YYYY." or "… puede recibir otra desde el DD/MM/YYYY."; the verifier's revoke-then-regrant probe asserts the refusal, plus boundary tests (365 allowed, 366 refused, allowed once the window has passed). Cortesía, trial and founder grants are refused to any super admin ("La cuenta es super admin: no recibe cortesías, pruebas ni founder.") and to a blocked account ("La cuenta está bloqueada."); the trial ends at most 365 days ahead ("La prueba dura como máximo un año: elegí una fecha hasta el DD/MM/YYYY."); the Django admin shows `plan` and `plan_expires_at` read-only. The mock and `TrialForm` (`max` a year ahead) follow. RED observed for every new backend test and for the 3 new frontend tests against the old mock. With approval, `test_backoffice_superadmin_guards.py` (`WRITES` trial date: today + 30 days) and `test_subscription.py` (the admin plan edit now changes nothing) were adjusted. Checks: `docker compose exec -T backend sh -c 'ruff check . && ruff format --check . && python manage.py makemigrations --check --dry-run && pytest -q'` → ruff clean, 144 files formatted, no migration changes, 947 passed; `docker compose exec -T frontend sh -c 'npx tsc --noEmit -p . && npx eslint src --max-warnings 0 && npx prettier --check src && npx vitest run'` → tsc, eslint and prettier clean; 368 passed, 1 failed: the known `terminos.test.tsx > shows the same version as the backend`. Deviations accepted by the parent:
  1. The old "365 days from the first grant" message is gone; the one-year-in-two message covers that case ("… como máximo el 01/03/2027.").
  2. `clean_plan` and the plan branch of `save_model` were removed from the Django admin: dead once the plan is read-only.
  3. `TrialForm` reuses `lastCourtesyDay()` for its `max` (same one-year limit; `format.ts` was outside the surface).
  4. The writer removed its own scratch copy of the mock after the frontend RED check.
- **L7** (2026-11-20): parent recheck of T3 (2a54254): backend 947 passed. Verifier's probes rerun on the fix: the concurrency probe passes (at most 20 active); `test_revoke_then_regrant_resets_the_year`, written to show the bug, now gets 400 on the re-grant, the expected refusal. Verifier scratch removed. Feature closed: S1–S6 done. Pending for the user: push and PRs; two-step verification for super admins (follow-up).
- **L8** (2026-11-20): user, about "Comprador Prueba" (Productor, paying through Mercado Pago): "por que no me deja subirlo o bajarlo de plan?". Probe (rolled back): empresa → 400 "Para dar un plan pago sin cobrar, usá una cortesía." (as designed); basico → 200, a bug present before this feature: the account drops to Básico while Mercado Pago keeps charging Productor. S4 addition: the plan change refuses an account with a running subscription (authorized or paused, or cancelled still in its paid month) with "La cuenta paga una suscripción: para bajarla, cancelá la suscripción desde su ficha (sigue con el plan hasta el fin del mes pagado); para subirla, la persona se suscribe al otro plan." The record does not offer "Cambiar plan" for such an account and shows that sentence instead. T4 opened.
