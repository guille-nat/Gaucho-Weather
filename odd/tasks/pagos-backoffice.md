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
| T1 | S2, S3, S5 (backend) | delegated, unit A, parallel with T2 | done | parent re-run 2026-11-19: 576 passed (36 in test_payments.py), ruff and makemigrations --check clean; commit `feat(pagos)` below |
| T2 | S4 | delegated, unit B, parallel with T1 | done | RED 43 failed → GREEN 73 passed; parent spot check 73 passed |
| T1b | S3 (review advisories) | inline | done | RED 4 failed → GREEN 40 passed; suite 580 passed |
| T3 | S7 | inline (≈250 lines, one behaviour: no writer reason) | done | RED 9 failed → GREEN; suite 589 passed |
| T4 | S5, S6 (+ Pagos tab for S7) | delegated, unit C (Writer trigger b: context backstop) | in progress | |

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
- **L7** (2026-11-19, user, verbatim): "continua donde lo dejaste".
  - Unit A re-verified by the parent: 576 passed, ruff check/format clean, no missing migrations.
  - The parent wrote `Doc/funcionalidades/pagos.md` (flow, endpoints, settings, sandbox steps), indexed it, and marked the "planes sin cobro" decision in `planes.md` as replaced.
  - T1 committed. Next: T3 (S7).
- **L8** (2026-11-19): T1 was committed as deefdd4. The native review ran on that commit alone, base 822431b; the user answered "Revisar este cambio".
  - The lenses were risk, resilience and reliability, under lineage review-cad75bbc227fd50a.
  - The review was approved and acknowledged, which burned its authority. It left 7 advisories.
  - Fixed inline as T1b:
    - double subscribe: one pending checkout per account; a plan switch cancels the old one first;
    - non-ASCII `x-signature` gave a 500: it now answers 401.
  - Left as follow-ups in `pagos.md`: no `ts` freshness check; a payment that arrives before its subscription is lost.
  - Open question for the user: what a `paused` subscription does to the plan.
- **L9** (2026-11-19): a7c75af was reviewed under lineage review-decda5d3ebff0bc0, approved and acknowledged.
  - All three lenses flagged the same thing: the local cancel was rolled back after the cancel at Mercado Pago succeeded.
  - Fixed: the refusal is raised after the block commits (RED 1 failed, then GREEN, suite 581 passed).
  - Accepted and documented: the user row stays locked while the Mercado Pago HTTP call runs.
- **L10** (2026-11-19): 63568b5 was reviewed under lineage review-4c066015ecfc942c: approved with no findings, acknowledged.
  - T3 (S7) was done inline.
  - `GET /api/backoffice/pagos/?tipo=pagos|suscripciones` is paginated; an unknown tipo is a 400.
  - `resumen.payments` gives `active_subscriptions`, `monthly_ars`, `month_payments` and `month_ars`, in ARS only, with the month in Buenos Aires time.
  - Amounts are numbers, following `COERCE_DECIMAL_TO_STRING: False`.
- **L11** (2026-11-19): RDD assess of 3566828 (T3): medium, `under_budget` (290 lines), so it stays pending in the open slice.
  - T4 was delegated to one bounded writer under the context backstop.
  - Allowed edit surfaces: the frontend pages, api, mocks, tests and styles, plus the three docs.
