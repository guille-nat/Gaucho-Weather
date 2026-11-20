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
| T3 | S1, S6 verifier blockers and hardening | delegated writer (context backstop) | pending | |

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
