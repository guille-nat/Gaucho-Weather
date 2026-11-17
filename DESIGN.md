---
name: Gaucho Weather
description: A weather app built as a farm tool. The whole screen takes the colour of the sky over the place, with white type, solid tinted panels and one pampa-gold accent.
colors:
  sky-a: "#1d68c4"
  sky-b: "#124f9e"
  glow: "rgb(255 214 102 / 0.2)"
  panel: "color-mix(in srgb, var(--sky-a) 70%, #04102a)"
  panel-deep: "color-mix(in srgb, var(--sky-a) 48%, #04102a)"
  panel-hover: "color-mix(in srgb, var(--sky-a) 80%, #04102a)"
  line: "color-mix(in srgb, #fff 22%, var(--panel))"
  track: "color-mix(in srgb, #fff 16%, var(--panel))"
  ink: "#ffffff"
  ink-2: "color-mix(in srgb, #fff 88%, var(--sky-a))"
  ink-deep: "#0b1533"
  gold: "#f2b705"
  gold-ink: "#1d1600"
  rain: "#9ad8ff"
  ok-fill: "#c9f2d6"
  ok-ink: "#0b4220"
  crit-fill: "#ffd9cf"
  crit-ink: "#741002"
  offline-fill: "#fff1c2"
  offline-ink: "#3a2a00"
typography:
  display:
    fontFamily: "Onest, Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "clamp(5.5rem, 26vw, 6rem)"
    fontWeight: 300
    lineHeight: 0.95
    letterSpacing: "-0.04em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Onest, Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Onest, Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.15
  verdict:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.5
rounded:
  input: "12px"
  control: "14px"
  panel: "20px"
  pill: "999px"
spacing:
  gutter: "16px"
  gutter-tablet: "24px"
  gutter-desktop: "40px"
  panel-pad: "16px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-deep}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "52px"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "52px"
  button-secondary-hover:
    backgroundColor: "{colors.panel-hover}"
  verdict-pill:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.gold-ink}"
    typography: "{typography.verdict}"
    rounded: "{rounded.panel}"
    padding: "14px 52px 16px 16px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel-pad}"
  input:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-deep}"
    typography: "{typography.body}"
    rounded: "{rounded.input}"
    padding: "0 14px"
    height: "52px"
  level-ok:
    backgroundColor: "{colors.ok-fill}"
    textColor: "{colors.ok-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 10px 2px 8px"
  level-caution:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.gold-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 10px 2px 8px"
  level-critical:
    backgroundColor: "{colors.crit-fill}"
    textColor: "{colors.crit-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 10px 2px 8px"
  chip:
    backgroundColor: "{colors.track}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 10px 2px 8px"
  tabbar:
    backgroundColor: "{colors.panel-deep}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    height: "68px"
  offline-strip:
    backgroundColor: "{colors.offline-fill}"
    textColor: "{colors.offline-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
---

# Design System: Gaucho Weather

## Overview

**Creative North Star: "Cielo vivo"**

The app is painted in the sky over the place on screen. A full-bleed field, drawn from a pair of sky colours and a soft radial glow where the sun stands, sits behind everything. Its colour follows the condition of this hour and the time of day: deep sky blue for a clear day, slate for cloud, deep teal for rain, violet for storm, navy at night and warm coral at dawn and dusk. When the forecast changes, the whole interface cross-fades to the new sky over 1600 ms. On the forecast screens the weather of this hour also moves in that field: rain falls as hard as the millimetres say and leans with the wind, clouds drift at the wind's speed and direction, a storm brightens now and then, and a clear night shows its stars. A clear, calm day stays still. Every panel, line and secondary ink is mixed from the sky, so the screen changes as one surface instead of being repainted piece by piece.

On that field the type is white, the numbers are large and confident, and a few solid tinted panels answer the field questions. The personality is trustworthy, plain-spoken and direct, with life in it. Colour gives the mood, and a single warm accent, pampa gold, marks what matters for the field: the day's verdict, a lote's decisions, the active tab, a switch that is on, the founder seal. The world rejects both the empty minimal screen and the decorated one. Panels are solid and nothing ornaments a number; the only glass is the floating tab bar.

Legibility in full sun is a hard rule here, not a polish step. Every sky pair is checked for AA with white text (white on `sky-a` ≥ 5.4:1, `ink-2` ≥ 4.6:1). Body text is 17 px, the smallest text, tab labels included, is 16 px, targets are 44 px or more, and state is never carried by colour alone.

**Key Characteristics:**
- A full-bleed sky field whose colour follows the forecast condition and time of day, and cross-fades between skies (static with reduced motion).
- An animated weather layer on the forecast screens, drawn from the data of this hour, with a pause beside the temperature (one still frame with reduced motion).
- White type on the sky. Dark ink appears only on light fills: white controls, gold, and the status fills.
- Solid panels mixed from the sky toward a deep navy. The floating tab bar is the only glass: tinted, lightly blurred, and AA-safe.
- One warm accent, pampa gold, reserved for field verdicts, decisions, the active state and the founder seal.
- Onest Light for big tabular numerals, Onest SemiBold for headings, and Atkinson Hyperlegible Next for everything you read.
- Soft, generous rounding (20 px panels) and a calm 16 px internal rhythm.

## Colors

The sky supplies the field and every neutral, and the gold is the only colour that speaks on top of it.

### Primary
- **Pampa Gold** (`gold`): the one warm accent. It fills the "Para el campo" verdict pill, the caution level chip, the founder banner, badge and plan badge. It also draws the 4 px top bar of a lote's decisions panel, the active tab bar, the checked switch, the focus outline (3 px solid) and link underlines. Text on gold is always **Gold Ink** (`gold-ink`, 9.9:1).

### Secondary
- **Rain Blue** (`rain`): the fill of rain bars. All the 7-day rain bars share one scale, and each bar always sits beside its millimetres and probability.

### Neutral
- **Sky Top** (`sky-a`) and **Sky Bottom** (`sky-b`): the two stops of the field gradient (`sky-a` holds to 28%, then fades to `sky-b`). The values in the frontmatter are the default clear-day sky. Nine themes override the pair on `:root[data-sky]`: `dia`, `parcial`, `nublado`, `lluvia`, `tormenta`, `alba`, `noche`, `noche-nublada` and `noche-lluvia` (values in `frontend/src/styles/tokens.css`). `sky-a` of each theme is mirrored in `THEME_COLOR` in `frontend/src/lib/sky.ts` for the browser bar.
- **Sun Glow** (`glow`): the radial light at the top right of the field. It is warm on clear skies and dawn, cool or barely there at night and under cloud.
- **Sky Panel** (`panel`): the default surface for panels, secondary buttons, notices and plan cards. It is the sky mixed 70% toward night navy `#04102a`.
- **Deep Sky Panel** (`panel-deep`): the mobile tab bar, mixed 48% toward night navy.
- **Lifted Sky Panel** (`panel-hover`): the hover state of panel-coloured controls and the featured plan card.
- **Panel Line** (`line`) and **Rain Track** (`track`): hairlines and dividers, and the unfilled track of bars, chips, switches and skeletons. Both are white mixed into the panel.
- **White** (`ink`): all type on the sky and on panels, and the fill of primary buttons, inputs and search.
- **Sky Ink** (`ink-2`): secondary text such as minimum temperatures, regions, hints and dry days. It is white tinted 12% toward the sky.
- **Night Ink** (`ink-deep`): text on white controls (primary button, inputs, search, skip link).
- **Status pairs**: `ok-fill`/`ok-ink`, `crit-fill`/`crit-ink` and `offline-fill`/`offline-ink`. Each is a light fill with its own dark ink and passes AA on its own. They are used for level chips, the error notice and the offline strip.

### Named Rules
**The Sky Is the Palette Rule.** A new surface colour is mixed from `--sky-a` (or from white into `--panel`), never written as a fixed hex, so it cross-fades with the sky. A fixed fill is allowed only when it carries its own dark ink, as gold and the status pairs do.

**The One Warm Thing Rule.** Gold marks field verdicts, decisions, the active state, focus and the founder seal. It is never a decorative fill and never a second brand colour on a panel.

**The Contrast Budget Rule.** Anything drawn over the sky (the animated layer, a flash) may add only as much white as keeps secondary ink at 4.5:1 on that sky, with a 10 % margin (`whiteBudget` in `frontend/src/lib/atmosphere.ts`). A bright day leaves about 1.5 % and a night about 25 %. Clouds therefore use the sky veiled toward grey at its own luminance (`cloudTone`): they desaturate the field and never brighten it.

**The Paired Ink Rule.** Every light fill names its ink (`gold`/`gold-ink`, `ok-fill`/`ok-ink`, `crit-fill`/`crit-ink`, `offline-fill`/`offline-ink`, white/`ink-deep`). White text never sits on a light fill.

## Typography

**Display Font:** Onest (with Atkinson Hyperlegible Next, system-ui)
**Body Font:** Atkinson Hyperlegible Next (with Atkinson Hyperlegible, system-ui)

**Character:** Onest is a modern grotesk. It sets the large numerals light and tight, and the headings semibold. Atkinson Hyperlegible Next carries every sentence and label, chosen for letterforms that stay distinct in glare and for older eyes. Loaded weights: Onest 300/500/600 and Atkinson 400/700.

### Hierarchy
- **Display** (Onest 300, clamp(5.5rem, 26vw, 6rem), line-height 0.95, -0.04em, tabular numerals): the current temperature in the hero only.
- **Headline** (Onest 600, 2rem, 1.15, -0.02em): page titles. Headings use `text-wrap: balance`.
- **Title** (Onest 600, 1.125rem, 1.15): panel titles. The condition line under the temperature uses Onest 500 at 1.375rem, and the 7-day rain figures use Onest with tabular numerals.
- **Verdict** (Atkinson 700, 1.125rem, 1.35): the field-verdict sentence inside the gold pill.
- **Body** (Atkinson 400, 1.0625rem / 17 px, 1.45): all running text, with `text-wrap: pretty` on paragraphs.
- **Label** (Atkinson 700, 1rem / 16 px): buttons, chips, level chips, the offline strip and the active tab. The inactive tab label uses 400 at the same size.

### Named Rules
**The 16 px Floor Rule.** Nothing is set below `--text-small` (1rem), tab labels and fine print included.

**The Tabular Figures Rule.** Every figure that is compared or scanned (temperatures, ranges, mm, prices, founder numbers) uses `font-variant-numeric: tabular-nums`.

**The Sentence Case Rule.** The system has no uppercase labels and no tracked-out small caps. Labels are set in sentence case and gain emphasis through weight.

## Layout

The layout is mobile-first and single-column at 390 px. Content lives in a centred column (max 1180 px) with a gutter that grows from 16 px to 24 px at 600 px and to 40 px at 960 px. Below 960 px a fixed four-tab bar (Clima, Lotes, Alertas, Perfil, 68 px plus the safe area) sits at the bottom, and the main column reserves its height plus 32 px. At 960 px and above the tab bar becomes a sticky, transparent top bar with the brand mark, and the forecast splits into two columns (5fr / 7fr). Grids of cards go to two columns at 760 px, and to three for plans.

The rhythm is 16 px: panel padding, gaps between forecast blocks and the 16 px gutter. Sections are separated by 24 px. Plan cards use 20 px padding. The hour strip scrolls horizontally inside its panel rather than widening the page.

## Elevation & Depth

Depth comes mostly from tone. Panels are flat, solid steps darker than the sky, and there is no border, blur or translucency. Shadows are soft, low-contrast navy (`rgb(2 8 24 / …)`). They appear in two places: under the light elements that float on the sky (primary button, search, verdict pill), and on the chrome that overlays content (the mobile tab bar, map controls). Inset rings stand in for borders: a 2 px white-mixed ring on secondary buttons and pending chips, and a 2 px gold ring on the featured plan.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 10px 28px rgb(2 8 24 / 0.25)`): the verdict pill and the search field, the two light objects that lead the screen.
- **Lift** (`box-shadow: 0 6px 18px rgb(2 8 24 / 0.22)`): the white primary button.
- **Glass** (`box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.24), inset 0 0 0 1px rgb(255 255 255 / 0.1), 0 12px 32px rgb(2 8 24 / 0.34)`): the floating glass tab bar.
- **Featured** (`box-shadow: inset 0 0 0 2px var(--gold), 0 10px 28px rgb(2 8 24 / 0.28)`): the recommended plan card.
- **Control Ring** (`box-shadow: inset 0 0 0 2px color-mix(in srgb, #fff 55%, var(--panel))`): secondary buttons and pending chips.

### Named Rules
**The Solid Panel Rule.** Panels are opaque tints of the sky. No `backdrop-filter`, no glass, no translucent white cards. The one exception is the tab bar, a pane of liquid glass by the user's decision (2026-11-17, "La navbar debe diferenciarse hazla estilo liquit glass pero con un poco de blur"). It keeps a 78 % Deep Sky Panel tint under a 14 px blur, so its labels hold AA with any content beneath, and it turns solid without `backdrop-filter` or under `prefers-reduced-transparency`.

**The Light Floats Rule.** Only light-filled elements on the sky (white controls, gold) cast a drop shadow. Sky-tinted panels stay flat.

## Shapes

The shapes are soft and generous, in three radii and a pill. Panels, notices, plan cards and the verdict pill use 20 px. Buttons, the offline strip, the founder banner and the skip link use 14 px. Inputs use 12 px. Chips, level chips, badges, rain bars and switches are full pills (999 px), and icon buttons are circles. Borders are not used; inset rings or tone separate things instead. The active-tab bar is a 4 px gold bar with its bottom corners rounded.

## Components

### Buttons
Big, quiet and thumb-sized.
- **Shape:** 14 px corners, 52 px minimum height, 20 px horizontal padding, Atkinson 700 at 17 px.
- **Primary:** a white fill with Night Ink text and the Lift shadow. It is the one bright control on the sky.
- **Secondary:** a Sky Panel fill, white text and a 2 px white-mixed inset ring. Hover lifts the fill to Lifted Sky Panel.
- **Danger:** transparent with a 2 px coral inset ring and white text. **Danger solid:** a deep red fill with white text.
- **States:** press scales to 0.96 over 120 ms. Disabled is 60% opacity. Focus is the global 3 px gold outline at a 3 px offset.

### Field Verdict Pill (signature)
The "Para el campo" pill is the one gold object on the sky. It is a full-width button with 20 px corners, a gold fill and Gold Ink text. Its head is in Onest 600 at 16 px and its verdict sentence in Atkinson 700 at 18 px (for example "Jueves llueve 12 mm: no entres con la sembradora"). It casts the Float shadow and has a chevron that rotates on expand. Its focus outline turns white so it stays visible against gold. When expanded, a Sky Panel opens below with the other decisions and the reasons behind them, revealed in 200 ms.

### Level Chips and Chips
- **Level chips:** a pill with an icon and a word on a light fill: `ok-fill`/`ok-ink`, gold/`gold-ink` for caution, and `crit-fill`/`crit-ink` for critical. Atkinson 700 at 16 px. The word and the icon carry the meaning, and the fill confirms it.
- **Chips:** a pill on Rain Track with white text. The pending variant is transparent with the Control Ring.

### Cards / Containers
- **Corner Style:** 20 px.
- **Background:** Sky Panel. The featured plan uses Lifted Sky Panel with the Featured shadow.
- **Shadow Strategy:** flat (see Elevation & Depth).
- **Border:** none. A lote's decisions panel carries a 4 px gold inset bar along its top edge.
- **Internal Padding:** 16 px, or 20 px on plan cards.

### Inputs / Fields
- **Style:** a white fill, Night Ink text, 12 px corners, 52 px height, 14 px padding and 17 px text. The search field is taller (58 px, 19 px text) and floats with the Float shadow.
- **Focus:** the 3 px gold outline at a 2 px offset. The search field shows it on `:focus-within`.
- **Error:** a 3 px red inset ring, plus a field-error line with an icon and text below.

### Navigation
The navigation is a floating pane of liquid glass: Deep Sky Panel at 78 % with `blur(14px) saturate(170%)`, 28 px corners, a 1 px white highlight on its top edge and a soft navy shadow. On mobile it floats 12 px above the bottom edge, or above the home indicator, inset 12 px from the sides, with four equal tabs, each an icon above a 16 px label in Sky Ink. The active tab turns white and bold (700), sits on a lens (a 22 px pill of 8 % white), and gets a 4 px gold bar, so it is never marked by colour alone. At 960 px and above the pane is a sticky top bar 12 px from the top, with the brand mark at the left, the icon beside each label, and the gold bar under the active label.

### Rain Bars
A 10 px pill track in Rain Track with a Rain Blue fill. All 7 days share one scale. The millimetres sit to the right in bold Onest with tabular numerals, and dry days drop to Sky Ink at weight 400.

### Offline Strip and Notices
The offline strip uses a warm cream fill with dark ink, 14 px corners, Atkinson 700 at 16 px and an icon. Notices are Sky Panel blocks with 20 px corners. The error notice switches to the `crit-fill`/`crit-ink` pair, and its button becomes `crit-ink` with white text.

### Switch
A 52 by 32 px pill on Rain Track with the Control Ring and a white thumb. When on, the track turns gold and the thumb turns Gold Ink. The hit area extends to 44 px without changing what is drawn.

## Motion

Motion explains a change of state and never decorates. Without support, or with reduced motion, every change simply happens. The tokens are `--dur-fast` (120 ms) for press and hover, `--dur-base` (200 ms) for state changes and page cross-fades, and `--dur-sky` (1600 ms) for the sky. Easing is `--ease-out` for state changes and `--ease-glide` (`cubic-bezier(0.22, 1, 0.36, 1)`) for anything that travels or enters.

- **Navigation** (the focal moment): each page enters by sections on every navigation, whether between tabs or within one (Lotes to a lote, back, Perfil to Suscripción). Each section fades in and rises 12 px over 380 ms (`--ease-glide`), 45 ms after the one above it, capped at 180 ms. Content that replaces a loading state (the forecast blocks, the lote cards, alert items) enters the same way when it is inserted. On a tab change, the glass lens also travels to the new tab as a shared `<ViewTransition name="tab-lens">` (320 ms). The root takes no part in the view transition: a whole-page cross-fade read as an abrupt swap, and it froze the glass tab bar into a snapshot.
- **Rain bars:** after a wait the farmer saw (120 ms or more), the 7-day rain bars grow from zero, one day after another, 40 ms apart.
- **Saved place:** starring a place moves its row from "Recientes" to "Guardados" with a view transition, one name per row.
- **Icon swap:** the sky pause keeps both icons in the slot and cross-fades them (opacity, scale 0.25 to 1, blur 4 px).
- **Dialogs:** they open in 240 ms from 96 % scale with a fade, close in 160 ms, and the backdrop fades with them (`@starting-style`, `allow-discrete`).
- **Disclosures:** the Perfil rows, the account-danger block and "Ver modelos" grow and shrink by height where `::details-content` and `interpolate-size` exist.
- **Reduced motion:** view transitions are off, sections only fade in (160 ms), icons only cross-fade and dialogs only fade.

## Do's and Don'ts

### Do:
- **Do** mix every new surface from the sky: `color-mix(in srgb, var(--sky-a) N%, #04102a)` for panels, or white into `var(--panel)` for lines and tracks.
- **Do** keep white type on the sky and panels, and give every light fill its paired dark ink (`gold-ink`, `ok-ink`, `crit-ink`, `offline-ink`, `ink-deep`).
- **Do** keep a new sky theme as a `--sky-a`/`--sky-b`/`--glow` triple in `tokens.css`, mirror its `--sky-a` in `THEME_COLOR` in `sky.ts`, and check white on `sky-a` for ≥ 5.4:1.
- **Do** pair every state with an icon, a word or a weight change, as the active tab (gold bar plus weight 700) and the level chips (icon plus word) do.
- **Do** keep targets at 44 px or more, growing the hit area with a pseudo-element when the drawn shape is smaller (switch, founder badge).
- **Do** use tabular numerals for every figure that is compared.
- **Do** let the sky cross-fade over `--dur-sky` (1600 ms) and keep it static under `prefers-reduced-motion`.
- **Do** draw every moving effect from a datum of this hour, keep it under the contrast budget, and keep lightning at most once a second.

### Don't:
- **Don't** use glassmorphism, `backdrop-filter` or translucent white panels. Panels are solid; the tab bar is the only glass, with its tint held for AA.
- **Don't** spend gold on decoration or as a second panel colour. It marks the field verdict, decisions, the active state, focus and the founder seal.
- **Don't** set any text below 16 px, and don't lower contrast for elegance (light grey on light, white on gold).
- **Don't** use uppercase labels, eyebrows or tracked small caps above headings.
- **Don't** write fixed hex colours in component CSS when a token exists. Drift found in `frontend/src/styles/app.css` that needs fixing (not yet tokenized): `#ff6a4d` on the danger button hover (line 311) and `#ffb3a3` on the account-danger summary text (line 2376). Other untokenized literals of the same kind: `#ff9a85` (danger ring, lines 307 and 1368), `#c2361f` (danger solid, 315), `#e2482b` (input error ring and selected map vertex, 1444 and 1710), `#eef3fb` (primary hover, 289), `#f7c21f` (verdict hover, 596), `#4a5470` (placeholders, 1435 and 1900), and `#1d68c4` as a literal caret colour (1430 and 1895). The 7-day millimetres (`.day-mm`, line 971) ask for weight 700 in Onest, which is not loaded (only 300/500/600), so the browser synthesizes the bold.
