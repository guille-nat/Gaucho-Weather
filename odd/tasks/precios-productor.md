# Precios Productor — a pricing-card subscription page that makes Productor the obvious choice
Objective: redesign the subscription section like a hosting pricing page (cards side by side, the featured plan larger and marked), so more people choose Productor, without inventing prices, discounts or popularity.
Branch: `feat/cielo-animado` (continues; not pushed) · Delivery: ask-on-risk · Runner: Vitest + Testing Library + MSW (frontend).

## Specs
- **S1 — Request** (L1 verbatim): "rediseña el apartado de subscripciones para que sea parecido a como lo muestra Hostinguer, la idea es que parezca lo mas atractivo posible la subscripcion de Productor para que mas gente la compre"
- **S2 — Pricing cards** (shared by Suscripción and Planes):
  - Three cards side by side from 760 px (Básico | Productor | Empresa). Productor comes first in the DOM, so phones, screen readers and the keyboard meet it first; wide screens put it in the middle column.
  - Each card: name, who it is for, the price (big "$ X / mes" when set in the admin, otherwise "Precio a confirmar"), one action, and what it includes with ticks. Limitations stay muted with a cross, not struck through: a struck "Sin notificaciones push" would read as a double negative.
  - The highlighted plan (Productor): taller, gold ring, the ribbon "El más elegido" (L6), the bright primary action.
  - Real hooks only, on the highlighted card:
    - "Quedan N lugares de founder: gratis para siempre", on Suscripción, for someone who is not a founder while slots remain (Planes already says it in its banner);
    - "Probalo N días gratis", for someone with no account yet.
- **S3 — Suscripción page order:**
  - the current plan as a compact strip, with usage;
  - "Cambiar de plan" (heading kept: right for someone who already has a plan, and the flows' tests use it) with the three cards: the current one is marked "Tu plan"; the others offer "Pedir este plan"; a trial on Productor offers "Quedarme con Productor";
  - the pending request and "Darme de baja" (unchanged flow);
  - "Sos founder" and "Historial".
- **S4 — Honesty** (assumption, explained to the user):
  - no struck-through reference price or "-X %" without a real previous price;
  - "El más elegido" only while it is true (L6: founders and every trial are on Productor);
  - the existing request flow and copy stay ("Pedir este plan", "Darme de baja", "Todavía no cobramos online…").

- **S5 — Pay in pesos or dollars** (L9 verbatim): "da ambas opciones a pagar los precios los actualizamos cada 3 neses".
  - Each plan has a fixed dollar price beside the peso price: `Plan.price_usd_month`, nullable, edited in the admin like the peso price (empty = "Precio a confirmar"). No automatic conversion.
  - Planes and Suscripción offer a currency choice, "Pesos" or "Dólares", as a segmented control reusing `.segmented-option`. The choice is remembered on this device (localStorage, wrapped in try/catch) and defaults to pesos.
  - The cards show the chosen currency: "$ 14.900 / mes" or "US$ 10 / mes". 0 shows "Gratis" in both. A missing price in the chosen currency shows "Precio a confirmar".
  - A line near the cards says: "Podés pagar en pesos o en dólares. Actualizamos los precios cada 3 meses."
  - Dollar prices (agent's decision, L9): Básico 0, Productor 10, Empresa 35. They are set in the dev DB and the dev mock; production sets them in the admin.

## Tasks
| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S2, S4 | inline | done | `PricingCard` and `featuredFirst`; planes tests RED → GREEN |
| T3 | S5 | delegated (context backstop) | done | Backend RED (`FieldDoesNotExist: price_usd_month`) → GREEN; frontend 8 RED (no "Moneda" group, no payment line) → GREEN; Vitest 249 |
| T2 | S3, S4 | inline | done | Suscripción cards; RED (no cards, no perk) → GREEN; Vitest 238 |

Route evidence: no Writer trigger (one shared component and two pages, sequential), so the parent writes inline.

## Log
- **L1** (2026-11-17, user, verbatim, with a screenshot of the current Suscripción page): "rediseña el apartado de subscripciones para que sea parecido a como lo muestra Hostinguer, la idea es que parezca lo mas atractivo posible la subscripcion de Productor para que mas gente la compre"
- **L2** (2026-11-17): every `price_ars_month` is null in dev (set in the admin), so the price block must work in both states. The pattern is borrowed from hosting pricing pages, not their brand: the colours stay those of "Cielo vivo".
- **L3** (2026-11-17, user, verbatim, mid-turn): "tambien rediseña para el aparrtado de proximas horas, divide bien cada parte del contenido para que a simplevista se distinga la info, lo mismo con deciciones para el lote". Queued as a separate feature after this one (forecast blocks, not pricing).
- **L4** (2026-11-17, user, verbatim, mid-turn): "en /historico no esta guardando la info, la idea es que sea lo mas precisa que se guarde una auditoria completa del viento y de la direccion junto con parametros climaticos". Queued after the forecast-blocks redesign; to be reproduced first.
- **L5** (2026-11-17, user, verbatim, mid-turn): "haz cuantas llamadas necesites segun sea necesario para ser lo mas preciso posible con el clima sin descuidar el costo". Belongs to the /historico audit work (L4).
- **L6** (2026-11-17, user, verbatim, mid-turn): "en el plan Productor hazlo como, el mas elegido". Checked before changing the ribbon: the dev database has every account on Productor (3 of 3). Structurally it stays true, because founders keep Productor free and every new account starts its trial on Productor.
- **L7** (2026-11-17): T1–T2 done.
  - Productor comes first in the DOM, so phones meet it first; wide screens place it in the middle (`grid-column: 2`, dense flow).
  - Screenshots: Planes and Suscripción at 1440 px show the featured card taller, with its band, ring and white action; at 390 px Productor shows first.
  - Checks: Vitest 238 passed; eslint, prettier and tsc clean.
  - Tests updated on purpose:
    - planes and suscripción order: Productor first;
    - the ribbon now reads "El más elegido";
    - perfilCopy: the price note is split into two levels with the same words;
    - suscripción: the current plan is now a marked card.
- **L8** (2026-11-17, user, verbatim): "ponles precios a los planes", then "decidelos tu en cuanto me beneficien y ayuden al productor".
  - Decided: Básico 0 (shown as "Gratis"), Productor 14 900 ARS per month, Empresa 49 900 ARS per month. The model is freemium; the rationale is in `Doc/funcionalidades/planes.md`.
  - Set in the dev DB through the Plan model (the same as the admin); the API returns them. The mock uses the same prices.
  - Production: set them in the admin; prices stay data, not code.
  - Test: "shows a plan priced at zero as free" RED ("Unable to find … Gratis") → GREEN.
- **L9** (2026-11-17, user, verbatim, answering whether the dollar price is fixed in the admin or converted from the official or MEP rate): "da ambas opciones a pagar los precios los actualizamos cada 3 neses".
  - Read as: both currencies payable, fixed prices in each, updated every three months, so no exchange-rate API.
  - Dollar prices decided by the agent: Productor US$ 10 and Empresa US$ 35, round and in line with the peso prices.
- **L10** (2026-11-17): T3 done (S5).
  - Backend: `Plan.price_usd_month`, nullable, in the serializer and the admin (list and editable); migration `0008_plan_price_usd` (one additive field). The dev DB was set through the model: Básico 0, Productor 10, Empresa 35. `GET /api/planes/` returns `price_usd_month` 0, 10 and 35.
  - Frontend: the store `lib/currency.ts` (localStorage `gw-currency-v1`, try/catch, `useSyncExternalStore`, pesos by default; it remembers the choice in memory only when storage is blocked). `CurrencyChoice` in `PricingCard.tsx` renders the "Moneda" group of `.segmented-option` buttons with `aria-pressed` and the payment line. Both pages pass the chosen currency to every card. The dev mock has the dollar prices.
  - RED → GREEN: backend "plans endpoint returns the dollar price"; frontend: starts in pesos, switches every card, remembers the choice after unmount and re-render, "US$ 10 / mes", 0 dollars is "Gratis", a missing dollar price is "Precio a confirmar", and the payment line on Planes and on Suscripción. The peso display is pinned by "keeps showing the peso price with its period", which passed before and after the change.
  - Checks: backend pytest test_plans + test_account 42 passed; ruff check and format clean; `makemigrations --check` clean. Vitest 249 passed; eslint and prettier clean; tsc shows only the known `src/sw.ts` errors.
