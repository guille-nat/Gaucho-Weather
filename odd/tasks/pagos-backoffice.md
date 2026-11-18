# Pagos y backoffice — Mercado Pago subscriptions in pesos, and a backoffice for super admins
Objective: a farmer subscribes to a paid plan and pays monthly through Mercado Pago in pesos; super admins run accounts, requests, payments and prices from an in-app backoffice.
Branch: `feat/cielo-animado` (continues; not pushed) · Delivery: ask-on-risk · Runners: pytest (backend/tests, in the container with `--ds=config.settings.test`); Vitest + Testing Library + MSW (frontend).

## Specs
- **S1 — Request** (L1, L2 verbatim):
  - "desarrolla la integracion con mercado pago y hazme un backofice para mi y todos los super admins"
  - On paying in dollars: "Otra pasarela para USD" (the dollar gateway is still to be chosen; see S5).
- **S2 — Payments model** (new app `apps.payments`, owned by unit A):
  - `ProviderSubscription`: user, plan, provider (`mercadopago`), currency (`ARS`), amount (int ARS), external_id (unique), status (`pending`, `authorized`, `paused`, `cancelled`), checkout_url, next_payment_at (nullable), created_at, updated_at.
  - `Payment`: user, subscription (nullable), provider, external_id (unique), amount (decimal), currency, status (`approved`, `pending`, `rejected`, `refunded`, `cancelled`), paid_at (nullable), payload (JSON), created_at.
  - A provider interface (`apps/payments/providers/base.py`) with: start a subscription (returns checkout URL and external id), cancel, fetch subscription, fetch payment, and verify a webhook. `mercadopago.py` implements it over httpx against the official REST API.
  - Read the official Mercado Pago docs (Context7 or mercadopago.com.ar/developers) for:
    - `POST /preapproval` with `auto_recurring` (monthly, `currency_id: "ARS"`), `back_url`, `payer_email` and `external_reference`;
    - `GET` and `PUT /preapproval/{id}`, and `GET /v1/payments/{id}`;
    - the `x-signature` HMAC webhook verification.
  - `PlanChange.Reason` gains `payment` ("pago aprobado") and `payment_ended` ("suscripción terminada").
- **S3 — Subscribing and the webhook** (unit A):
  - `POST /api/pagos/suscribirme/` `{plan, currency}`, authenticated, returns 201 `{checkout_url}`. Refusals, each with a Spanish `detail`:
    - Básico, the current paid plan, or a founder: 400;
    - `currency: "USD"`: 409 "Pagar en dólares todavía no está disponible.";
    - Mercado Pago not configured: 503 "Los pagos todavía no están habilitados.";
    - a plan with no ARS price: 409.
  - `POST /api/pagos/mercadopago/webhook/`: public and CSRF-exempt; a bad or missing signature is 401; idempotent on the provider's ids. It fetches the resource from the API rather than trusting the body. Then:
    - preapproval `authorized`: apply the plan via `change_plan(..., reason="payment")`, which ends a trial;
    - preapproval `cancelled`: keep the plan until `next_payment_at` (reuse `plan_expires_at` and the existing expiry task, if it handles any expiry), otherwise move to Básico with `payment_ended`;
    - payment events: upsert `Payment`. A rejected payment does not downgrade; Mercado Pago retries.
  - `GET /api/pagos/` (authenticated): the user's current subscription and payments.
  - `POST /api/pagos/cancelar/` (authenticated): cancels at the provider and applies the cancellation rule above. Users without a provider subscription keep the existing `PlanRequest` cancel flow, unchanged.
  - `GET /api/planes/` adds `payments_enabled` (bool).
  - Settings `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` and `MERCADOPAGO_API_URL` (default `https://api.mercadopago.com`) come from the environment and are listed in `.env.example` (never commit real values). `back_url` uses the existing public frontend URL setting.
- **S4 — Backoffice API** (new app `apps.backoffice`, owned by unit B). Every endpoint requires `is_superuser`: an anonymous user gets 401/403, a non-superuser 403. Every write records a `BackofficeAction` (actor, action, target user, payload, at).
  - `GET /api/backoffice/resumen/`: accounts (total, founders, trial, active by plan), founder places left, pending requests, new accounts in the last 30 days.
  - `GET /api/backoffice/cuentas/?q=&plan=&estado=`: paginated rows (id, name, email, plan, status, founder_number, lotes, date joined, last login, is_superuser).
  - `POST /api/backoffice/cuentas/{id}/plan/` `{plan, note}`: `change_plan(reason="staff", by=actor)`.
  - `GET /api/backoffice/pedidos/`: pending `PlanRequest`s. `POST .../{id}/aplicar/` and `.../{id}/rechazar/` reuse the same logic as the Django admin action.
  - `GET /api/backoffice/precios/` and `PUT /api/backoffice/precios/{code}/` `{price_ars_month, price_usd_month}`: the quarterly price update.
  - `GET /api/backoffice/registro/`: recent `BackofficeAction`s.
  - `GET /api/auth/me/` adds `is_superuser`.
- **S5 — Dollars:** no USD gateway yet. The provider interface must allow a second provider. The UI says "Pagar en dólares: próximamente" when dollars are chosen. The user picks the gateway later (question pending).
- **S6 — Frontend** (unit C, after A and B):
  - Suscripción: "Suscribirme" on a paid plan when `payments_enabled` and pesos are chosen. It POSTs, then goes to `checkout_url`.
  - Returning to `/perfil/suscripcion?pago=ok|pendiente|error` shows a notice.
  - "Darme de baja" uses `/api/pagos/cancelar/` when a provider subscription exists.
  - The payment history is listed on the page.
  - `/backoffice`, only for superusers (others are redirected), has tabs Resumen, Cuentas, Pedidos, Pagos, Precios and Registro. It is reached from Perfil by a link shown only to superusers. It is Operate mode in the "Cielo vivo" system and uses the width on desktop.
- **S7 — Backoffice payments** (unit A, after phase 1): `GET /api/backoffice/pagos/` lists payments and subscriptions; `resumen` adds monthly ARS revenue from authorized subscriptions and payments this month.

## Tasks
| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S2, S3, S5 (backend) | delegated, unit A, parallel with T2 | paused (uncommitted in the tree) | the writer reported "All green" before writing Doc/funcionalidades/pagos.md |
| T2 | S4 | delegated, unit B, parallel with T1 | done | RED 43 failed → GREEN 73 passed; parent spot check 73 passed |
| T3 | S7 | delegated, unit A continued | pending | |
| T4 | S5, S6 | delegated, unit C | pending | |

Route evidence: Writer trigger (a) parallelism (A and B are independent behaviours with disjoint edit surfaces, each several files) plus (b) the context backstop. The parent owns `config/settings/base.py` (INSTALLED_APPS) and `config/urls.py`, registered upfront.

Risk:
- item 2 (permissions: superuser gate, webhook signature);
- item 5 (a paid external provider);
- item 3 (`/api/auth/me/` and `/api/planes/` gain fields; additive only).

An independent verifier runs after T1–T4.

## Log
- **L1** (2026-11-17, user, verbatim, via /loop): "desarrolla la integracion con mercado pago y hazme un backofice para mi y todos los super admins"
- **L2** (2026-11-17): before designing, checked whether Mercado Pago Argentina charges subscriptions in USD.
  - The official docs show only ARS for `auto_recurring.currency_id`.
  - Merchants report that Mercado Pago does not convert currency and charges the figure in local money, so sending 10 for "USD 10" would charge $10 ARS.
  - The user chose "Otra pasarela para USD". Stripe does not onboard Argentine merchants directly, so the gateway is still to be chosen.
- **L3** (2026-11-17): the history audit (`auditoria-historico`) is committed as 9a4f707; its independent verifier is running in a scratch copy.
  - The parent registered the empty `payments` and `backoffice` apps (6864f80) so units A and B can run in parallel. Both were launched.
- **L4** (2026-11-17, user, verbatim, choosing the USD gateway among PayPal, Stripe with a US company, or later): "Decidir más adelante".
  - Dollars stay "Pagar en dólares: próximamente" (S5). Everything in pesos and the backoffice go ahead.
- **L5** (2026-11-17): unit B done (S4).
  - It reuses `plans.apply_request` and `reject_request`, which the admin action already calls, so no extraction was needed.
  - Anonymous gets 403 (session auth); a non-superuser gets 403 "Solo los super admins pueden usar el backoffice.".
  - Every write records a `BackofficeAction` in the same transaction.
  - A rejection note lives only in the log, because `PlanRequest` has no note field.
  - For unit C: the SPA treats a non-CSRF 403 as a lost session, so the frontend must check `me.is_superuser` before calling `/api/backoffice/`.
- **L6** (2026-11-17, user, verbatim): "pausa y seguimos mañana". The loop is stopped, and unit A was stopped at its last step (its doc) with its tests reported green.
  - Unit A's work is uncommitted in the working tree:
    - `backend/apps/payments/*` (models, migration 0001, admin, urls and the rest);
    - `backend/apps/accounts/models.py`, `views.py` and migration `0009_alter_planchange_reason.py`;
    - `backend/config/settings/base.py`, `.env.example`, `backend/tests/test_payments*.py`.
  - Next session:
    1. Re-run unit A's verification; write `Doc/funcionalidades/pagos.md` (flow, settings, sandbox steps for the owner); spot check; commit T1.
    2. T3 (S7: payments in the backoffice).
    3. T4 (frontend S5/S6; it must check `me.is_superuser` before calling `/api/backoffice/`, see L5).
    4. An independent verifier over T1–T4 (risk items 2, 3 and 5).
    5. Follow-up: the COALESCE upsert for history (auditoria-historico L6, advisory 3).
