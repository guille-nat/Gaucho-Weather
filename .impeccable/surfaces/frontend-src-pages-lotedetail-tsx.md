---
version: 1
slug: "frontend-src-pages-lotedetail-tsx"
primary_target: "frontend/src/pages/LoteDetail.tsx"
related_targets: ["frontend/src/pages/MisLotes.tsx","frontend/src/components/AppShell.tsx"]
---

# Surface: Hoy en tu lote (lote detail) and the app-wide fileteado world

Mode: Operate. Audience: Argentine farmers aged 45–70, outdoors in full sun, using the phone one-handed. Job: in under 10 seconds, know what to do today and this week on this field, and why.
Constraints: mobile-first (390 px), WCAG 2.2 AA, body text ≥ 16 px, touch targets ≥ 44 px, never colour alone, offline PWA. Ornament never sits over a number.

## Direction contract
THESIS: Gaucho Weather speaks like a fileteado country cart. Painted ribbons title each section and enamel colours carry life, while the data inside stays clean and large. It refuses both the sober technical app and the souvenir poster.

OWN-WORLD:
- Filete red #c8102e in the top bar.
- Green #0b6e4f, gold #f2b705 and blue #1d3fb8 for ribbons and states.
- A near-white #fffaf0 working ground.
- Lettering display type with a two-colour drop shadow, used only for short headings.
- Atkinson Hyperlegible Next for all data.
- Filete scrolls only in frame corners.

STORY: The farmer opens a lote and reads the day's decision first ("Jueves llueve 12 mm: no entres con la sembradora"). They check the rain for the week, the hours, and when the sun rises and sets, and they trust it because each verdict says why.

FIRST VIEWPORT:
- A red top bar with the lote name in lettering, plus the town, crop, hectares and forecast time.
- A ribbon carrying the day's decision.
- An Ahora/Hoy/Sol block.
- A "7 días" ribbon over day columns with rain bars at one shared scale, plus mm and probability.
- Below that, Hora a hora and Para el trabajo ribbons.
- Bottom nav: Lotes, Pronóstico, Alertas, Perfil.

SIGNATURE: section headers are painted filete ribbons with lettering. Their colour encodes the state of that section, always with an icon and a word as well.

FORM: Fileteado criollo, the assigned direction, #4 on the ordered list of gaucho-culture worlds. The user pinned "cultura gaucha, vida y color". Seed: seed:94aec30eb0f49ffe.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Decisions
- The approved composition is .impeccable/mocks/decision/assigned-g.html. It replaces the previous "plano catastral + canon" world from 2026-11-03.
- The parcel outline survives as a small element on Mis lotes cards, restyled into the fileteado world.
