---
version: 1
slug: "frontend-src-pages-mislotes-tsx"
primary_target: "frontend/src/pages/MisLotes.tsx"
related_targets: ["frontend/src/App.tsx"]
---

# Surface: Mis lotes (app shell + field list)

Mode: Operate. Audience: Argentine farmers aged 45–70, outdoors in full sun, using the phone one-handed. Job: see today's verdict for each field in under 10 seconds and open the one that needs action.
Constraints: mobile-first (390 px baseline), WCAG 2.2 AA, body text ≥ 16 px, touch targets ≥ 44 px, meaning never conveyed by colour alone, offline-capable PWA.

## Direction contract
THESIS: This is the category-standard farm app played straight, and each field reads as a surveyed parcel. It refuses the generic weather-widget list of city names.

OWN-WORLD:
- White ground, ink #141414, and white cards with a 1 px rule and 12 px radius.
- Survey blue #2b6cb0 for interactive elements, catastro pink #d6336c for small brand marks, black primary buttons.
- State colours appear only with an icon and a label.
- Type: Atkinson Hyperlegible Next for the body, Barlow Semi Condensed in uppercase for survey labels.

STORY: The farmer opens the app, sees which field needs attention tonight, trusts the reason shown, and taps into it or adds a new field.

FIRST VIEWPORT:
- Top bar with the date, the "Actualizado" time and "Mis lotes".
- A one-line attention summary.
- Field cards. Each card has a parcel outline drawn in black survey line, with the field number inside, a hatch pattern by severity and a north tick. Beside it: the field name, the uppercase meta line (TOWN · CROP · HA), a status chip and the verdict in bold.
- A sticky black "Agregar lote" button above the bottom navigation (Lotes, Alertas, Pronóstico, Perfil).

SIGNATURE: the parcel outline (the field's real shape when known, a generic quadrilateral otherwise) filled with a hatch pattern by severity.

FORM: canon fused with the grounded "Plano catastral" (#2 on the round-2 list), user-pinned blend. Seed: seed:2b91f0427520ad03.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Decisions
- 2026-11-03: the bottom navigation has 3 tabs in Phase 1 (Lotes, Alertas, Perfil), not the 4 the first viewport lists. Phase 1 has no forecast screen, and an empty tab would mislead. Pronóstico returns when that screen exists.
- 2026-11-03 (finish review): the Phase 1 caveat sits in ink next to the 2 m minimum on the card and the detail, so nothing reads as "no frost, safe". The top bar labels the forecast time ("Pronóstico de las HH:MM"); the offline strip shows when the server produced the data, never the fetch time.
- 2026-11-03 (finish review): the `none` hatch is ink; a lote with no forecast yet has no hatch and a dashed outline, like its dashed chip. The parcel stamp shows only the number, larger; the area stays in the meta line.
