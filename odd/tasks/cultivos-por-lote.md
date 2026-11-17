# Cultivos por lote — several crops per lote, changed quickly, and a readable lote sheet
Objective: a lote can hold several crops, each with its own hectares and sowing date, changed in a few taps from the lote page; the lote facts are grouped with icons and colour.
Branch: `feat/cultivos-lote` (stacked on `feat/perfil-ux`) · Delivery: ask-on-risk, stacked-to-main (cached) · Runners: pytest (backend/tests, in the container with `--ds=config.settings.test`); Vitest + Testing Library + MSW (frontend).

## Specs
- **S1 — Several crops per lote** (L1 verbatim: "el cultivo presente en ese lote deberia de poder cambiarse rapidamente o haber mas de 1 cultivo porque puede ser que al lote lo dividan en varios cultivos"; decision L2: "Lista con hectáreas"):
  - a lote has a list of plantings, each with a crop (required, same choices as today), hectares (optional, > 0) and a sowing date (optional);
  - the same crop may appear twice (two sowings); at most 8 plantings;
  - when the lote area and the plantings' hectares are known and the sum is larger than the lote, the app warns (it does not block).
- **S2 — Change crops quickly** (L1: "deberia de poder cambiarse rapidamente"): from the lote page, one action opens the crop editor in place and saves without going through the full edit form.
- **S3 — Readable lote sheet** (L1 verbatim: "la informacion debe de estar bien separada con colores e iconos facil de leer, sigue los patrones modernos de diseño"): the lote facts are grouped (crops; field: surface and location; place: establishment and locality), each fact with an icon, crops shown as coloured chips with their label (never colour alone), following DESIGN.md "Cielo vivo". Assumption: "la información" is the lote page facts, the screen this message is about.
- **S4 — Existing data kept**: every lote with a crop today gets one planting with that crop and sowing date (hectares empty); a lote with a sowing date and no crop gets an "otro" planting with that date (L5); a reverse migration puts the first planting back.

## API contract (shared by T1 and T2)
- `Lote` JSON drops `crop` and `sowing_date` and adds `plantings`: `[{"id": 7, "crop": "soja", "area_ha": "12.50", "sowing_date": "2026-10-01"}]`, ordered by id; `area_ha` and `sowing_date` may be null; a lote with none has `[]`.
- Writes (`POST /api/lotes/`, `PATCH /api/lotes/{id}/`): `plantings` is a list of `{crop, area_ha?, sowing_date?}` without ids that replaces the whole list; absent on PATCH means unchanged; absent on POST means `[]`.
- Validation errors use DRF's nested shape: `{"plantings": [{"crop": ["…"]}, {}]}`; more than 8 items: `{"plantings": ["Hasta 8 cultivos por lote."]}`.
- Crop labels stay as today (`soja` Soja, `maiz` Maíz, `trigo` Trigo, `girasol` Girasol, `cebada` Cebada, `sorgo` Sorgo, `otro` Otro).

## Tasks
| ID | Specs | Unit | Route | Risk | Status | Commit |
|---|---|---|---|---|---|---|
| T1 | S1 S4 | Backend: Planting model, data migration, nested serializer, admin, tests, Doc/funcionalidades/lotes.md | delegated (parallel with T2; context backstop) | item 1 (migration of existing crops), item 3 (lote API shape) | pending | — |
| T2 | S1 S2 S3 | Frontend: types, mocks, crop editor in the form, quick change on the lote page, readable facts, card meta, tests | delegated (parallel with T1; context backstop) | none | pending | — |
| T3 | all | Seam check (full suites), screenshots, independent verifier for T1 | inline + verifier | — | pending | — |

Route evidence: T1 and T2 are independent units with disjoint edit surfaces (backend/ vs frontend/), each several hundred lines, built against the contract above; the parent session is past its context backstop.

## Log
- **L1** (2026-11-17, user, verbatim): "la informacion debe de estar bien separada con colores e iconos facil de leer, sigue los patrones modernos de diseño, pero tambien el cultivo presente en ese lote deberia de poder cambiarse rapidamente o haber mas de 1 cultivo porque puede ser que al lote lo dividan en varios cultivos"
- **L2** (2026-11-17, user answer): how each part is loaded → "Lista con hectáreas (Recomendado)": each crop with its hectares and sowing date (optional); the app warns when the sum passes the lote area.
- **L3** (2026-11-17): exploration: `crop` is display only (models, serializer, admin, LoteForm, LoteDetail Facts, `lib/lote.ts` meta line, mocks); the decision engine does not read it.
- **L4** (2026-11-17): T1 4448de7 (pytest 471), T2 a3de452 (Vitest 200), nested errors readable 2c5fb3d. Independent verifier (items 1, 3): 2 blockers — a partial PATCH stored a planting without crop (fixed test-first in 95d7f0c, recheck passed, pytest 472); a lote with a sowing date and no crop lost the date in the migration (dev has none: 9 lotes, 5 with crop, 0 date-only). Advisories: `area_ha: ""` saved as null; old `crop` fields on POST silently dropped; mock area message aligned.
- **L5** (2026-11-17, user answer on the date-only lotes): "Cultivo \"Otro\" (Recomendado)" — create an "otro" planting with that date.

