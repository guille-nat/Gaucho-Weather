# mejoras-productor

Objective: give a producer a reason to pay over free weather services. Four improvements, in order. Roadmap only: each one gets its own spec and decisions before code.
Branch: `feat/cielo-animado`, after `promociones` S0. Delivery: ask-on-risk.

## Specs (roadmap, pending detailed specs)

User's question (L1): "Que le faltaria para que un productor decida usarla y pagar? antes de cualquier servicio meteorologico gratis?" User's answer to the proposal (L2): "me gusta las cosas que planteas desde la 1 a la 4 para mejoras".

**M1 — Trust: validated accuracy, shown per zone.**
- Today the engine outputs `engine_version: "v0"` and `validated: false` (`Doc/funcionalidades/motor-decisiones.md`).
- Compare the archived forecasts (`Doc/funcionalidades/archivador.md`) with observations (`Doc/reglas-agronomicas.md`, "Observaciones para el backtesting" and "Cómo se mide la precisión"). Publish hit rates per zone and decision, for example "en tu zona acertamos 9 de cada 10 heladas el último año".
- Open: the observation source per zone and its coverage.

**M2 — Application log as evidence.**
- Every spraying is recorded with the conditions at that time and place (wind, gusts, Delta T, inversion, rain risk), the lote, the product and the person who did it. The log can be exported for a drift complaint, the agronomic prescription, or the field owner or contractor.
- Open: the fields required by provincial agrochemical rules; whether the agronomist's sign-off goes in; the PDF format.

**M3 — Alerts by WhatsApp.**
- Frost and other critical alerts by WhatsApp, as a paid-plan channel.
- Open: the provider (WhatsApp Business Cloud API, Meta), the cost per message and template approval, opt-in and opt-out, and the per-plan limits.

**M4 — The field's own data.**
- A rain-gauge entry per lote, and the water balance (`Doc/reglas-agronomicas.md` §6), so sowing and field-work advice uses the farm's real rain.
- Open: shared gauges between neighbours; the soil water-holding defaults per soil type.

(M5, the team and roles for Empresa, was proposed too. The user approved 1–4, so M5 is not in this roadmap.)

## Tasks
| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| R1 | M1 detailed spec + plan | tbd | after promociones S0 | |
| R2 | M2 detailed spec + plan | tbd | after R1 | |
| R3 | M3 detailed spec + plan | tbd | | |
| R4 | M4 detailed spec + plan | tbd | | |

## Log
- **L1** (2026-11-19): the user asked what would make a producer pay. Proposed, in order: validation, application log, WhatsApp, own-field data, team.
- **L2** (2026-11-19): user: "me gusta las cosas que planteas desde la 1 a la 4 para mejoras, hablo de lo que hace diferenciar este sistema de cualquier otro".
