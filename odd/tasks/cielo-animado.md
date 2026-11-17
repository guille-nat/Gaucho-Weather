# Cielo animado — the app background follows the weather of this hour and shows it moving
Objective: the sky behind the forecast takes the condition of the current hour and animates it from real data (rain by mm/h, clouds by cover and wind, lightning in storms, stars on clear nights).
Branch: `feat/cielo-animado` (from `main`) · Delivery: ask-on-risk · Runners: pytest (backend/tests, in the container with `--ds=config.settings.test`); Vitest + Testing Library + MSW (frontend).

## Specs
- **S1 — Request** (L1, L2 verbatim): "quiero que el fondo de la app interactue con el clima que esta presente en la zona". Option chosen: "Animado con datos": "El color sigue el clima de esta hora y, además, se ve: lluvia que cae según los mm/h, nubes que se mueven según el viento, rayos con tormenta, estrellas de noche. Sin movimiento con reduced-motion. Necesita que el backend mande nubosidad y código de tiempo por hora."
- **S2 — Hour sky in the forecast payload** (S5/S10 contract, additive):
  - `now` gains `sky`, `cloud_cover_pct` and `rain_mm`; each `hourly` entry gains `sky` and `cloud_cover_pct`.
  - An hour is `tormenta` when most models carry WMO 95/96/99 that hour, and `lluvia` when the median precipitation is ≥ 0.2 mm (assumption: the daily 1 mm threshold is too high for one hour). Otherwise the daily cloud thresholds apply (< 30 % `sol`, < 70 % `parcial`, else `nublado`; no cloud data is `parcial`).
- **S3 — Colour of this hour:** the sky theme, the hero icon and the hero condition follow `now.sky`. A payload without it (the service worker cache) falls back to the day's sky. The 7-day list keeps each day's sky.
- **S4 — Animated sky on the forecast screens** (Inicio and the lote detail), behind the content, from the current hour:
  - rain streaks whose count follows `now.rain_mm`, slanted and pushed by the wind;
  - clouds whose number and opacity follow `cloud_cover_pct`, drifting with the wind's speed and direction;
  - in a storm, a soft lightning brightening at random intervals of several seconds;
  - at night with a clear or partly cloudy sky, slowly twinkling stars, fewer under cloud;
  - a clear calm day stays still: motion only appears when there is weather to show.
  - Other screens keep the static sky colour.
- **S5 — Access and cost:**
  - `prefers-reduced-motion`: one still frame, no lightning.
  - A visible pause control next to the hero (WCAG 2.2.2), remembered on this phone.
  - Lightning never more than once per second (WCAG 2.3.1).
  - The layer is decorative (`aria-hidden`, no pointer events); it stops while the page is hidden; device pixel ratio capped at 2 and about 30 frames per second.
  - Particles stay faint enough that white text keeps AA on the sky.

## Tasks
| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S2 | inline | pending | |
| T2 | S3 | inline | pending | |
| T3 | S4, S5 | inline | pending | |

Route evidence: no Writer trigger (the frontend depends on the backend contract and each unit is small or sequential), so the parent writes inline. Risk forecast: item 3 does not fire, because the payload change only adds fields. Forecast ~600 authored lines.

## Log
- **L1** (2026-11-17, user, verbatim): "quiero que el fondo de la app interactue con el clima que esta presente en la zona"
- **L2** (2026-11-17): the user chose "Animado con datos (Recommended)". Findings before choosing:
  - "Cielo vivo" already tints the field by the day's sky (`todaySky` = `daily[0].sky`) and the time of day.
  - `hourly` had no cloud or weather code, although the archive holds both per model.
  - PRODUCT.md rejects "animaciones de nubes que no informan nada", so every effect maps to a datum.
  - Motion runs only on the forecast screens, with a pause control, per WCAG 2.2.2 and 2.3.1.
