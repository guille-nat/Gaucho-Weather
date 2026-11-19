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

**S0 — Clear terms (blocks S1–S3).** User (L4): "hay que aclarar todo esto, recorda que lo que no se aclara se da por sentado y eso lleva a que sea un problema legal y que al cliente no le guste".
- A versioned "Términos y condiciones" page and a "Política de privacidad" page, plus one rules page per program: founders, coupons, referrals and free months.
- Acceptance is recorded with the version and timestamp at sign-up and at every subscription. A new version asks for acceptance again and is announced by email before it takes effect.
- Before going to Mercado Pago, Suscripción shows in plain words:
  - the exact amount and the frequency, and that it renews automatically;
  - the discount, how many charges it lasts and the price after it;
  - the date of the first charge;
  - how to cancel ("Darme de baja") and what happens then (the paid month is kept).
- Emails:
  - a confirmation after subscribing, carrying those same terms;
  - a notice before a discount ends and the price goes back to normal (proposal: 7 days before);
  - a notice when a referral reward or free months are applied.
- The founder rules must say explicitly:
  - what "gratis para siempre" covers: the Productor plan, while the service exists;
  - moving up to Empresa pays only the difference;
  - cancelling Empresa returns the account to free Productor;
  - the benefit is personal and not transferable.
- Today the app promises "Tenés el plan Productor gratis para siempre." (`FounderBadge.tsx:19`, `Suscripcion.tsx:508`) without any terms page. Existing founders must keep at least that.
- (A) The texts are drafted by us and **must be reviewed by a lawyer** before going live. Ley 24.240's duty to inform and the "botón de baja" are the reference points.

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
- Referrer reward (decided, L3): each referee counts once their **second** approved charge arrives (anti-abuse: sign up with a discount, pay once, cancel). Each one that counts takes 1/3 of a month off the referrer's next charge, so three make a free month. Mercado Pago's minimum makes that charge $15, not $0.
  - Perfil shows the progress, for example "Invitaste a 2 de 3: tu próximo mes sale $4.967".
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
0. Founder moving up (proposed, L4): pays the Empresa − Productor difference ($35.000 today) as a permanent founder credit; cancelling returns to free Productor; the backoffice cannot approve Empresa for a founder through a request. Today's gaps:
   - a founder cannot pay for anything (subscribe refuses every founder);
   - a request approved to Empresa would make it free forever;
   - `_end` skips founders, so cancelling would leave Empresa free.
1. ~~Referrer reward~~ decided (L3). Still open: the referee's reward (proposal: 50% on the first month).
2. Whether a coupon and a referral code stack, or only one applies (common SaaS default: only one).
3. Whether coupons apply to Empresa as well as Productor.
4. Whether founder and trial accounts can use coupons (founders don't pay; trial accounts would on subscribing).

## Tasks
| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| L-lab | credits approach | inline sandbox experiment | running (L2) | |
| T0 | S0 clear terms (pages, acceptance, pre-checkout summary, emails) | tbd | blocked on the texts and the lawyer review | |
| T1 | S1 coupons (models, API, subscribe flow, restore task, backoffice) | tbd | blocked on decisions 2–4 | |
| T2 | S2 referrals | tbd | blocked on decision 1 | |
| T3 | S3 credits | tbd | blocked on the lab result | |
| T4 | S4 visibility and reports | tbd | after T1–T3 | |

## Log
- **L1** (2026-11-19): request quoted above. User agreed ("dale") to run the sandbox experiment and design in parallel.
- **L2** (2026-11-19): lab preapproval `8324c91c792549e193da03d7cec5ed86` (daily, $15, test buyer) created directly at Mercado Pago, outside the local database. Waiting for the user to authorize it. Then: pause right after the first charge, resume after the next charge date, and record what Mercado Pago does.
- **L3** (2026-11-19): user: "si que invite a 3 personas gana 1 mes, que pensas?"
  - Recommended the same cost spread per referral (1/3 of a month each), counted from the referee's second approved charge. User: "si".
- **L4** (2026-11-19): user asked: "y que pasa con un founder si se sube de plan, recorda que el founder tiene el plan productor gratis".
  - Verified today's gaps (decision 0 above) and proposed the founder credit.
  - User: "hay que aclarar todo esto, recorda que lo que no se aclara se da por sentado y eso lleva a que sea un problema legal y que al cliente no le guste". Added S0.
