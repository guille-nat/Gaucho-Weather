---
version: 1
slug: "frontend-src-pages-inicio-tsx"
primary_target: "frontend/src/pages/Inicio.tsx"
related_targets: ["frontend/src/pages/LoteDetail.tsx","frontend/src/components/AppShell.tsx"]
---

# Surface: Inicio (weather of here or of a searched place) and the app-wide "Cielo vivo" world

Mode: Operate. Audience: anyone checking the weather, and Argentine farmers aged 45–70 outdoors in full sun. Job: open the app and know, in seconds, what the weather is doing here and what it means for the field.
Constraints: mobile-first (390 px), WCAG 2.2 AA, body ≥ 16 px, targets ≥ 44 px, never colour alone, offline PWA, no account needed.

## Direction contract
THESIS: A modern, minimal weather app full of life. The screen takes the colour of the sky above the place, the numbers are large and confident, and a small number of well-chosen blocks answer the field questions. It refuses both the empty minimal screen and the decorated one.

OWN-WORLD:
- A full-bleed sky field whose colour comes from the condition and the time: clear day is deep sky blue, cloudy is slate blue, rain is deep teal-indigo, storm is violet, night is navy, and dawn or dusk is warm coral.
- White type on the sky field.
- Solid tinted panels, a step lighter or darker than the field. No glassmorphism and no blur.
- One warm accent, pampa gold #f2b705, for the field ("campo") verdicts and the brand mark.
- A modern grotesk display with large tabular numerals, plus Atkinson Hyperlegible Next for text.
- Rounded 20 px panels and generous but purposeful spacing.

STORY: The visitor sees the place name and the big temperature, then the condition and today's max and min. A gold "Para el campo" pill gives the day's field verdict, such as "Jueves llueve 12 mm: no entres con la sembradora". Then come the hour strip, the 7 days with rain bars at one shared scale plus mm and probability, the rain of the last 7 days, wind and the sun times. A search sits one tap away at the top.

FIRST VIEWPORT:
- Top row: the place name with a location icon, and a search button.
- A huge temperature, then the condition and max/min.
- The gold field-verdict pill.
- An hourly panel (12 h, scrollable).
- The start of the 7-day panel.
- Bottom nav: Clima, Lotes, Alertas, Perfil.

SIGNATURE: the sky field changes colour with the forecast condition and the time of day. The change is a smooth cross-fade, and with reduced motion it is static.

FORM: User-pinned direction ("minimalista con colores y diseño moderno, con vida"), no roll. Seed: none (unavailable).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Decisions
- This replaces the fileteado world and the earlier catastro + canon world.
- Lotes become a tool tab. Each lote's forecast screen reuses the Inicio layout, plus its per-lote decisions.
