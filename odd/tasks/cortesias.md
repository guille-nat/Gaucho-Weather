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
- Out of scope, recorded as a follow-up: two-step verification for super admins.

## Tasks
| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S1–S4, S6 backend (model, API, expiry, emails, closing the plan change) | delegated writer (context backstop: the parent session is long) | pending | |
| T2 | S5 frontend | delegated writer (same reason) | pending, after T1 | |

Risk: item 2 (permissions and guards: who can give a paid plan for free) and item 3 (changes the backoffice plan-change API, requested by the user). Independent verifier after T2.

## Log
- **L1** (2026-11-20): user's request, verbatim in S above.
- **L2** (2026-11-20): found that `AccountPlanView` already moves any account to a paid plan for free, with no end date, no cap and no paying check; `TrialView` gives Productor until a date with no maximum. Proposed one "cortesía" concept; the user chose "Cerrarlo (Recomendado)".
