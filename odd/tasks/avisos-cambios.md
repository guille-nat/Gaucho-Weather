# avisos-cambios

Objective: the app keeps the terms' promises about changes. A price change is scheduled from the backoffice at least 30 days ahead, emailed at once to the affected subscribers, and applied to their Mercado Pago subscriptions on its date. A new terms version is emailed before it takes effect and asked for only from its date.
Branch: `feat/cielo-animado`. Delivery: ask-on-risk; chain strategy cached as stacked-to-main (user's choice for this repo). Runner: `docker compose exec backend pytest -q`; frontend `npx vitest run` in the frontend container.

## Specs

User's choice (L1): "Hacerlo en la app (Recomendado)": "Desde el backoffice se programa un cambio de precio con fecha (mínimo 30 días): manda el email a los suscriptores en el momento y, llegada la fecha, cambia el monto en Mercado Pago. Lo mismo para una versión nueva de los términos."

The promises, verbatim from the texts:
- Términos §7: "Los precios pueden cambiar. Un cambio de precio se avisa por email con al menos 30 días de anticipación y rige desde el cobro siguiente a ese plazo."
- Términos §3: "Cuando estos textos cambien, se publicará una versión nueva con su fecha de vigencia y se avisará por email antes de que entre en vigencia. Al ingresar, la aplicación pedirá aceptar la versión nueva para seguir usando la cuenta."
- Reglas: "Los precios pueden cambiar. Cada cambio se avisa antes por email, como dicen los Términos y condiciones."

**S1 — Schedule a price change (backoffice).**
- A superuser schedules a new monthly ARS price for a plan with an effective date at least 30 days after today. A date sooner than that is refused with a message. Assumption: the 30 days apply to decreases too ("un cambio de precio", no distinction).
- One pending change per plan; a pending change can be cancelled before its date. Assumption: cancelling sends no email.
- Scheduling and cancelling are recorded in the backoffice log (`BackofficeAction`).

**S2 — The notice email, at once.**
- On scheduling, every account with an authorized or paused Mercado Pago subscription whose monthly amount changes gets one email: plan, current amount, new amount, the date it applies from, and how to cancel. The amount is computed by `price_for` with the new prices, so a Productor change also reaches founders on Empresa (`founder_empresa_price`).
- At most once per account and change, and a lost email never undoes the scheduling (same pattern as the confirmation email).

**S3 — Applying it on its date.**
- A daily task, on the effective date, sets the plan's price and updates the amount of every authorized or paused subscription at Mercado Pago (`PUT /preapproval/{id}` with `auto_recurring.transaction_amount`, sandbox-verified: memory `mercadopago/preapproval-mutability`), then the local `amount`.
- A subscription that Mercado Pago refuses is retried on the next run; the rest are applied. Idempotent.
- Assumption: a pending checkout created before the date is updated the same way, so it never charges the old price.
- The immediate price edit stays as it is: it only prices new checkouts (today's behaviour).

**S4 — Backoffice page.**
- Precios shows, per plan, the pending change (new price, date, how many accounts were notified) and lets the superuser schedule one or cancel it, each behind a confirmation dialog.

**S5 — Terms versions with an effective date.**
- A terms version is still the date it takes effect. A release can ship the next version dated in the future: until that date the account keeps the version in force and no dialog shows; from that date the blocking dialog asks for the new one.
- Every account gets one email about a future version before its date (a daily task; at most once per account and version), with the date and links to the texts.
- The legal pages show the version and "Vigente desde" its date.

## Tasks
| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S1, S2 scheduled change model, backoffice API, notice emails | inline (no writer trigger) | pending | |
| T2 | S3 provider amount update and the daily task | inline | pending | |
| T3 | S4 backoffice Precios page | inline | pending | |
| T4 | S5 terms versions with an effective date and notices | inline | pending | |

Forecast: about 900 authored changed lines, over the 400 budget: PR slices T1+T2, T3, T4 (stacked-to-main).
Risk: T2 is item 1 (changes what Mercado Pago charges running subscriptions) and gets its own commit and an independent verifier.

## Log
- **L1** (2026-11-20): from promociones L15 advisory 3 ("The texts promise emails that don't exist yet: a new terms version, and price changes."). Asked how to solve it; the user chose "Hacerlo en la app (Recomendado)".
- **L2** (2026-11-20): map: no scheduled model exists; `PriceDetailView.put` applies at once and logs `PRICE_UPDATE`; the provider has no amount update; emails are plain `send_mail` with a `*_sent_at` field and `on_commit`; periodic jobs are thin Celery tasks over idempotent services in `CELERY_BEAT_SCHEDULE`; `TERMS_VERSION` is duplicated in `backend/apps/accounts/terms.py` and `frontend/src/lib/terms.ts`.
