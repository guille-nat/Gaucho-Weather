# promociones

Objective: coupons, referral codes and free months ("credits") for Mercado Pago subscriptions, handled "como lo manejan todos los SaaS".
Branch: `feat/cielo-animado`. Delivery: ask-on-risk. Status: DESIGN. Nothing is implemented until the user closes the open decisions below.

## Specs (proposed, pending the user's decisions)

User's words (L1): "y si no le cancelamos ala sub osea que tome como debito el dia siguiente de la fecha pero que si no han pasado uncilo de cierre no le cobre? tambien la posibilidad de codigos de referidos, promocionales hay que tenerlas en cuenta, hay que manejarlo como lo manejan todos que tiene saas por subscipcion"

What Mercado Pago allows. Sandbox-verified on 2026-11-19; see `Doc/funcionalidades/pagos.md`.
- Changing `auto_recurring.transaction_amount` works for the following charges. The minimum is $15, and 0 is refused.
- The charge date cannot be moved: `next_payment_date` and `start_date` are silently ignored.
- Pause and resume within a cycle charge nothing and keep the date.
- Unknown: resuming after a pause that spanned a charge date. The lab is running (L2).
- Mercado Pago has no coupons, so every promotion is ours, applied through the amount.

**S1 — Coupons.** A super admin creates codes in the backoffice.
- Each code has:
  - `code`: unique and case-insensitive;
  - a kind: `percent` or `fixed` (ARS);
  - `value`;
  - `months`: how many charges it lasts, or forever;
  - the plans it applies to;
  - the dates it is valid from and until;
  - `max_redemptions`;
  - an active flag.
- A user types the code on Suscripción before going to the Mercado Pago checkout.
  - The page shows the discounted price.
  - The preapproval is created with that amount (never below $15).
- After the coupon's last discounted charge is approved (webhook `record_payment`), a task runs `PUT transaction_amount` back to the full price.
  - It re-reads the subscription to confirm the change, because a 200 is not proof.
  - It retries on failure.
- Each account redeems a coupon only once.
- Errors, with Spanish messages: invalid, expired, used up, or not valid for this plan.
- The redemption is stored: coupon, user, subscription, charges left.
- The backoffice lists the coupons with their uses and can deactivate one. Every write is logged (BackofficeAction).

**S2 — Referrals.** Every account has a personal code, for example `GW-ANA7`, and a share link shown on Perfil.
- The referee enters the code when subscribing (the same field as coupons) and gets a discount on their first charges.
- When the referee's first charge is approved, the referrer gets a reward.
- Abuse guards:
  - no self-referral;
  - one referrer per account;
  - the reward is given only after a real approved payment;
  - an optional cap on rewards per referrer.

**S3 — Credits ("meses gratis").** A balance of free months on the account, granted by the backoffice or earned by referral.
- An account that is not paying gets Productor until a date (like today's trial, not an expiry that `expire_trials` fights).
- An account that is paying, without cancelling the subscription: how depends on the lab result (L2).
  - (a) If resuming after a skipped date does not charge the skipped period, pause before the next charge and resume when the credit ends. This is the user's "que tome como débito el día siguiente".
  - (b) Otherwise, turn the credit into a discount on the following charges through the amount (the same machinery as S1), with the $15 minimum per charge.
- The backoffice "Dar prueba" for a paying account becomes "Regalar meses", replacing today's refusal.

**S4 — Visibility.**
- Suscripción shows the active discount or credit and when the price goes back to normal.
- Payments show the amount actually charged.
- Informes adds redemptions per coupon and referrals that converted.

## Open decisions (the user's)
1. The referral reward for each side, for example: referee 50% for 1 month, referrer 1 free month.
2. Whether a coupon and a referral code stack, or only one applies (common SaaS default: only one).
3. Whether coupons apply to Empresa as well as Productor.
4. Whether founder and trial accounts can use coupons (founders don't pay; trial accounts would on subscribing).

## Tasks
| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| L-lab | credits approach | inline sandbox experiment | running (L2) | |
| T1 | S1 coupons (models, API, subscribe flow, restore task, backoffice) | tbd | blocked on decisions 2–4 | |
| T2 | S2 referrals | tbd | blocked on decision 1 | |
| T3 | S3 credits | tbd | blocked on the lab result | |
| T4 | S4 visibility and reports | tbd | after T1–T3 | |

## Log
- **L1** (2026-11-19): request quoted above. User agreed ("dale") to run the sandbox experiment and design in parallel.
- **L2** (2026-11-19): lab preapproval `8324c91c792549e193da03d7cec5ed86` (daily, $15, test buyer) created directly at Mercado Pago, outside the local database. Waiting for the user to authorize it. Then: pause right after the first charge, resume after the next charge date, and record what Mercado Pago does.
