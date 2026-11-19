# backoffice-superadmin

Objective: turn `/backoffice` into the super admin's panel for manual changes and reports.
Branch: `feat/cielo-animado`, after `pagos-backoffice`. Delivery: ask-on-risk, nothing pushed without the user. Runners: backend `docker compose exec -T backend python -m pytest`; frontend `npx vitest run` in `frontend/`.

## Specs

User's words (L1): "Mejora el BackOfice debe servir como mi panel de superadmin para hacer cambios a mano" and "y quiero reportes e informes tambien". The user approved the scope below with "arranca" (L2).

Common rules for every spec:
- Every endpoint lives under `/api/backoffice/` and requires `is_superuser` through `IsSuperuser`.
- Every write records a `BackofficeAction` in the same transaction as the change. The action types are already in `apps/backoffice/models.py` (migration 0002).
- User-facing strings are in Spanish (es-AR); code is in English.
- Assumptions are marked (A).

**S1 — Account record.** "Ficha de cuenta: todo lo de un usuario en una pantalla (plan, historial, suscripción, pagos, lotes y alertas), con edición de nombre y email."
- `GET cuentas/<id>/` returns:
  - the profile: id, name, email, plan, membership status, founder_number, plan_expires_at, is_active, is_superuser, date_joined and last_login;
  - the plan history (`PlanChange`, newest first);
  - the Mercado Pago subscriptions, without `checkout_url`;
  - the payments, without payload;
  - the lotes (name and created date);
  - the alert rules (name or kind, and active).
- 404 for an unknown id.
- `PATCH cuentas/<id>/` with `name` and/or `email`.
  - An email already used by another account, compared case-insensitively, answers 400 "Ya hay una cuenta con ese email."
  - The email is normalized the same way registration does it.
  - Logged as `account_update` with `{before, after}`, listing only the fields that changed.

**S2 — Access control.** "Control de acceso: bloquear o desbloquear cuentas, dar o quitar superadmin, y mandar el mail para restablecer la contraseña."
- Blocking sets `is_active`.
  - Logged as `account_block` or `account_unblock`.
  - A blocked user cannot log in, and an open session stops working (Django rejects inactive users).
  - (A) Blocking does not cancel a Mercado Pago subscription.
- Super admin access is granted or revoked.
  - It sets `is_superuser` and `is_staff` together.
  - Logged as `superadmin_grant` or `superadmin_revoke`.
- A super admin can neither block nor revoke themself. Both answer 400 "No podés hacer eso con tu propia cuenta."
- The password-reset email reuses `apps.accounts.password_reset.send_reset_email`.
  - Logged as `password_reset`.
  - A blocked account answers 400 "La cuenta está bloqueada."

**S3 — Plan and founder by hand.** "Plan y founder: dar o extender una prueba con fecha de vencimiento, y marcar o quitar founder."
- Granting a trial takes a future date (`hasta`).
  - It puts the account on Productor with `plan_expires_at` set to the end of that day in Buenos Aires.
  - It goes through `apps.accounts.plans` (`change_plan` / `_switch`) with `PlanChange.Reason.STAFF`.
  - A past date answers 400 "La fecha tiene que ser futura."
  - A founder answers 400, because founders already have Productor.
  - Logged as `trial_grant` with `{until, from_plan}`.
- Marking a founder takes the next number from `FounderProgram`, puts the account on Productor without expiry, and is logged as `founder_grant`.
  - An account that is already a founder answers 400.
  - (A) Marking works even when the program's quota is used up. The super admin decides by hand, and the confirmation dialog shows the remaining quota.
- Removing founder clears `founder_number` and is logged as `founder_revoke`.
  - (A) The plan is left as it is: no expiry, so the account stays "active" on that plan. The super admin changes the plan separately if needed.

**S4 — Mercado Pago from the panel.** "Mercado Pago: volver a pedirle a Mercado Pago el estado de una suscripción (por si se perdió un webhook) y cancelarla desde el panel."
- Sync:
  - It fetches the account's latest subscription from Mercado Pago and applies it with `payments.services.sync_subscription`.
  - It records the subscription's charges via `/authorized_payments/search?preapproval_id=` with `record_payment`.
  - Logged as `subscription_sync` with `{subscription, before, after, payments}`.
- Cancel reuses `payments.services.cancel(user)` and is logged as `subscription_cancel`.
- Errors:
  - No subscription answers 404 "La cuenta no tiene una suscripción con Mercado Pago."
  - A provider error answers 502 "No pudimos conectar con Mercado Pago. Probá de nuevo en un rato."
  - Payments not configured answers 503.

**S5 — Revenue report.** "Ingresos: cobrado por mes en ARS, ingreso mensual recurrente, altas y bajas de suscripciones, y pagos rechazados."
- `GET informes/ingresos/` covers the last 12 calendar months in Buenos Aires time, oldest first. Each month has:
  - `cobrado_ars`: approved ARS payments by `paid_at`;
  - `pagos_aprobados` and `pagos_rechazados`, counted by `created_at`;
  - `altas`: subscriptions created that month whose status is not pending;
  - `bajas`: subscriptions whose `ended_at` falls that month and whose status is cancelled or paused.
- It also returns `mrr_ars`: the sum of the amounts of authorized, not-ended ARS subscriptions.
- Amounts are JSON numbers.

**S6 — Users report.** "Usuarios: altas por mes, reparto por plan, cuántas pruebas pasan a pago y founders."
- `GET informes/usuarios/` returns:
  - sign-ups per month over the last 12 months;
  - accounts per plan and membership status;
  - trial conversion: accounts that ever had `PlanChange` reason `trial`, and how many of them later had reason `payment`, plus the percentage;
  - founders used versus the quota.

**S7 — Usage report.** "Uso: lotes creados, alertas activas y usuarios activos en los últimos 30 días."
- `GET informes/uso/` returns:
  - lotes created per month over 12 months, plus the total;
  - active alert rules;
  - users with `last_login` in the last 30 days.

**S8 — CSV export.** "Exportar a CSV cuentas, pagos y registro."
- The endpoints are `GET informes/exportar/cuentas.csv`, `pagos.csv` and `registro.csv`, served as `text/csv; charset=utf-8` with a UTF-8 BOM.
- The headers are in Spanish.
- A cell starting with `=`, `+`, `-` or `@` is prefixed with `'` to block CSV injection.
- Each export is logged as `export` with `{file, rows}`.

Frontend:
- S1–S4 live in the Cuentas tab: clicking an account opens its record (`?cuenta=<id>`), whose actions go through confirmation dialogs.
- S5–S8 live in the Informes tab: tables, plain CSS bars (no new dependency), and download links.
- The Registro tab shows a label for every new action.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T0 | scaffolding (action types and migration 0002, Informes stubs and wiring, `backofficeGate`) | inline | done | 452cb84, 2b8110c |
| T1 | S1–S4 backend + frontend + docs | delegated writer A (parallel with T2) | done (verification pending) | 4d13fc6 |
| T2 | S5–S8 backend + frontend + docs | delegated writer B (parallel with T1) | done (verification pending) | fce2b80 |
| T3 | independent verifier over T1–T2 (S2 and S4 touch auth and payments: high-risk item 2) | delegated verifier | done: no blockers, every S# passes | 4bfc2de (guards) |

Route evidence: T1 and T2 are independent units with disjoint edit surfaces, and each is several hundred lines. They are launched together (Writer trigger a). The parent context is also past the backstop (b).

## Log
- **L1** (2026-11-19): "Mejora el BackOfice debe servir como mi panel de superadmin para hacer cambios a mano" / "y quiero reportes e informes tambien"
- **L2** (2026-11-19): scope S1–S8 proposed; the user answered "arranca".
- **L3** (2026-11-19): T0 scaffolding done.
  - `backofficeGate` was extracted from the mocks.
  - Informes stubs are wired into the URLs, the mocks and the tabs (seven tabs).
  - Migration 0002 adds the action types.
  - Checks: backend `tests/test_backoffice.py` 55 passed; frontend `backoffice.test.tsx` 17 passed.
- **L4** (2026-11-19): Writers A and B returned with all of S1–S8 implemented. Both reported `partial`, but only because the backend tests inside the container ran with `config.settings.dev`: the `DJANGO_SETTINGS_MODULE` env var beats `pytest.ini`.
  - Fixed in 7dc9df7: `addopts` now passes `--ds=config.settings.test`.
  - Seam check after both units: backend 705 passed and ruff clean; frontend 315 passed and eslint clean; typecheck shows only the 12 known `src/sw.ts` workbox errors.
  - Commits: fce2b80 (T2) and 4d13fc6 (T1, high-risk, on its own).
- **L5** (2026-11-19): extra assumptions the writers documented in the docs:
  - a repeated reset email within 10 minutes answers 429;
  - a write that changes nothing answers 200 and logs nothing;
  - the URLs use Spanish verbs;
  - the charge search reads only Mercado Pago's first page;
  - `pagos_aprobados` and `pagos_rechazados` count every currency;
  - `founders.usados` is the program's `next_number - 1`.
- **L6** (2026-11-19): T3 verifier found no blockers; S1–S8 all pass.
  - Probes: 36 guard tests committed as `tests/test_backoffice_superadmin_guards.py` (4bfc2de). The baseline's 598 tests pass on HEAD, and the output of existing endpoints is identical byte for byte.
  - Advisories:
    1. A trial granted to an account already paying through Mercado Pago sets an expiry, so the nightly `expire_trials` would move a paying account to Básico.
    2. A founder granted to a paying account keeps its Mercado Pago charge.
    3. Cancel calls Mercado Pago inside the database transaction.
    4. A race on the email check, or on two super admins revoking each other, ends in a 500 or in no super admin left.
    5. An export GET writes a log row, so another site could trigger it.
    6. Sync reads only the first page of charges.
  - Native review: user granted consent, but START refused with `lens_context_budget_exceeded` (530dcef..HEAD, 6086 lines). No authority was created.
