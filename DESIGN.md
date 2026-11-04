---
name: Gaucho Weather
description: Per-field farm decisions for Argentine producers, drawn as a cadastral plan on white paper.
colors:
  paper: "#ffffff"
  paper-sunk: "#f5f5f2"
  ink: "#141414"
  ink-2: "#3b3b38"
  rule: "#8f8f89"
  rule-strong: "#6b6b66"
  survey-blue: "#2b6cb0"
  survey-blue-ink: "#1f5592"
  survey-blue-wash: "#eaf1f9"
  catastro-pink: "#d6336c"
  crit: "#a3001b"
  crit-wash: "#fdecee"
  caut: "#6e3f00"
  ok: "#145a2a"
  wait: "#3b3b38"
  offline-wash: "#fff3cf"
typography:
  display:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.01em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0.02em"
  title:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0.03em"
  reading:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tnum"
  body-strong:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.45
  body-small:
    fontFamily: "Atkinson Hyperlegible Next, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
  button:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.06em"
  label:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.06em"
  meta:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0.04em"
rounded:
  chip: "6px"
  control: "8px"
  card: "12px"
  pill: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  gutter-phone: "16px"
  gutter-tablet: "24px"
  gutter-desktop: "40px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "52px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.survey-blue}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "52px"
  button-secondary-hover:
    backgroundColor: "{colors.survey-blue-wash}"
    textColor: "{colors.survey-blue-ink}"
  button-danger:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.crit}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "52px"
  button-danger-hover:
    backgroundColor: "{colors.crit-wash}"
    textColor: "{colors.crit}"
  button-danger-solid:
    backgroundColor: "{colors.crit}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "52px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "52px"
  chip-none:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "4px 8px 4px 6px"
  chip-pending:
    textColor: "{colors.wait}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "4px 8px 4px 6px"
  chip-critical:
    textColor: "{colors.crit}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "4px 8px 4px 6px"
  chip-caution:
    textColor: "{colors.caut}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "4px 8px 4px 6px"
  chip-ok:
    textColor: "{colors.ok}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "4px 8px 4px 6px"
  lote-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "12px"
  lote-card-active:
    backgroundColor: "{colors.paper-sunk}"
  tonight-panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "16px"
  tab:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    height: "68px"
  tab-active-icon:
    backgroundColor: "{colors.survey-blue}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    width: "56px"
    height: "32px"
  offline-strip:
    backgroundColor: "{colors.offline-wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
---

# Design System: Gaucho Weather

## Overview

**Creative North Star: "The Surveyed Parcel"**

Gaucho Weather is the category-standard farm app played straight, with every field (lote) drawn as a parcel on a cadastral plan. The world is a blend the user asked for: the canon farm-app skeleton (cards, a status chip, a black primary action, a bottom tab bar) fused with the material of a "plano catastral": black survey line on white paper, hatch fills, a north tick, a double-ruled title block and condensed uppercase survey lettering. It is light only, chosen for the use scene: outdoors, in full sun, with the screen brightness up.

Density is calm and one-handed. Each screen answers one work question before it shows data; the reading (tonight's minimum at 2 m) is set large in survey type, and the caveat that qualifies it sits beside it in ink, never as grey small print. Brand color is rationed to tiny catastro-pink marks; interaction is survey blue; everything else is ink on paper.

The built system rejects the generic weather-widget list of city names and the low-contrast "elegant" grey-on-white look: secondary text is still 11:1, rules are visible, and state is always carried by an icon and a word.

**Key Characteristics:**
- White paper, ink #141414, 1 px ruled white cards with a 12 px radius.
- Parcel outline signature: survey-line polygon, number stamp, severity hatch, north tick.
- Double title-block rule under every page head.
- Barlow Semi Condensed uppercase for survey lettering over Atkinson Hyperlegible Next for reading.
- Dashed line means "not data yet": no-forecast parcel, "Sin datos aún" chip, pending panel, loading skeleton.

## Colors

An ink-on-paper plan with one interactive blue, one rationed brand pink, and state tones that never appear without an icon and a label.

### Primary
- **Survey Blue** (survey-blue): every interactive affordance and only those: links, secondary buttons, the "Ver modelos" disclosure, the active tab's icon pill, focus rings, caret and selection. Darkens to **Survey Blue Ink** on hover; **Survey Blue Wash** is the secondary-button hover fill.

### Secondary
- **Catastro Pink** (catastro-pink): small brand marks only: the diamond in the rail brand and favicon, the accents in the gaucho empty-state drawing, and the center of the map stake. It never carries text or state.

### Tertiary
- **Critical Red** (crit) with **Critical Wash** (crit-wash): destructive actions, field errors, the form alert and the delete confirmation; the critical chip tone.
- **Caution Brown** (caut) and **Field Green** (ok): text-safe chip tones on white, defined for the severity states the decision engine will produce.
- **Offline Cream** (offline-wash): the fill of the offline strip and form notices, always with a 1.5 px ink border and an icon.

### Neutral
- **Paper** (paper): the ground, card and input fill.
- **Sunk Paper** (paper-sunk): pressed card, hover fill for icon buttons and desktop tabs, skeleton blocks, map ground.
- **Ink** (ink): text, survey line, primary buttons, title-block rules, tab-bar edge, every informational icon.
- **Ink Two** (ink-2): secondary text, meta lines, hints, inactive tabs (11:1 on white). **Wait** shares its value for the pending chip.
- **Card Rule** (rule): the 1 px card border and table/section dividers.
- **Strong Rule** (rule-strong): input borders (5.3:1), dashed placeholder borders, disabled icon buttons, scrollbar.

### Named Rules
**The Ink Information Rule.** Information is ink; only controls are blue. The attention icon, pin and info icons, the caveat and the parcel itself are ink. If it is not clickable, it is not survey blue.

**The Pink Mark Rule.** Catastro pink appears as a small filled mark (diamond, pin center, drawing accent), never as text, fill area or state.

**The Never Colour Alone Rule.** A state tone always travels with an icon and an uppercase label inside a chip, and with a distinct hatch in the parcel.

## Typography

**Display Font:** Barlow Semi Condensed (with Arial Narrow, sans-serif), weights 500/600/700, self-hosted via Fontsource.
**Body Font:** Atkinson Hyperlegible Next (with Atkinson Hyperlegible, system-ui), weights 400/700, self-hosted via Fontsource.

**Character:** Condensed uppercase survey lettering labels the plan the way a cadastral sheet does; Atkinson carries every sentence a 60-year-old reads in the sun. Numbers that matter are set in the survey face with tabular figures.

### Hierarchy
- **Display** (700, 3rem, 1): tonight's minimum on the lote detail, the one number the screen exists for.
- **Headline** (700, 2rem, 1.05, uppercase): the lote name on the detail title block.
- **Title** (700, 1.75rem, 1.05, uppercase): page titles ("Mis lotes", "Perfil", "Alertas", form titles); 2.25rem on auth screens. Empty-state and placeholder titles step down to 1.5rem and 1.375rem in the same style.
- **Reading** (700, 1.5rem, 1, tabular): the temperature on a lote card.
- **Body Strong** (700, 1.125rem, 1.25): lote card names, "Mínima esta noche a 2 m", establishment name.
- **Body** (400, 17px, 1.45): all running text; field labels are the same size in 700.
- **Body Small** (400, 16px): hints, fine print; the floor for any reading text.
- **Button** (700, 1.1875rem, 0.06em, uppercase): every button label.
- **Label** (700, 16px, 0.06em, uppercase): section heads ("Datos del lote"), chips, model names.
- **Meta** (500, 16px, 0.04em, uppercase): the TOWN · CROP · HA line under a lote name.

### Named Rules
**The Survey Lettering Rule.** Uppercase belongs to the survey face only: titles, labels, chips, buttons, tabs, meta lines. Sentences are never uppercase and never condensed.

**The Sixteen Floor Rule.** No reading text below 16 px on any viewport; on desktop the card meta, chip, caveat and waiting text step up to 17 px.

## Layout

Mobile-first from a 390 px baseline. Content sits in a single 640 px column (`page`) with a gutter of 16 px, 24 px from 600 px, and 40 px from 960 px. The spacing rhythm runs on 4 px steps (4, 8, 12, 16, 20, 24): card lists gap 10 px, form fields 20 px, sections 24 px.

On phones a fixed bottom tab bar (68 px, 2 px ink top edge) holds three tabs: Lotes, Alertas, Perfil. The primary "Agregar lote" button docks above it on a paper fade, full width up to 608 px. From 960 px the tab bar becomes a 240 px sticky left rail with a 2 px ink right edge and the wordmark; the dock joins the page title block; the lote list becomes an auto-fill grid of cards at least 400 px wide, inside a 1120 px main area.

A lote card is a three-column grid (80 px parcel, identity, 20 px chevron) over a full-width reading row, so the reading never wraps beside the drawing. The detail hero pairs a 140 px parcel (200 px from 600 px) with the titles. Scroll padding keeps focused fields clear of the tab bar and dock.

## Elevation & Depth

Flat paper. Depth is drawn with line, not light: 1 px rules for cards, 1.5 px ink borders for notices, 2 px ink edges for the tab bar, 3 px plus a 1 px second rule for title blocks. The only shadow is a soft lift on a hovered lote card (desktop pointer), paired with the border darkening to ink. The title-block double rule is built with box-shadow, but it is a rule, not elevation.

### Shadow Vocabulary
- **Card hover lift** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.06), 0 6px 16px -6px rgb(0 0 0 / 0.14)`): hovered lote card only.
- **Title-block second rule** (`border-bottom: 3px solid ink; box-shadow: 0 3px 0 paper, 0 4px 0 ink`): page heads, the detail head and the auth brand.

### Named Rules
**The Drawn Depth Rule.** Surfaces are flat at rest; hierarchy comes from rule weight (1 / 1.5 / 2 / 3+1 px). Shadow appears only as a hover response on a card that is a link.

## Shapes

Gently rounded containers on a plan of hard survey line. Cards, the tonight panel, the map frame and confirmations use 12 px; buttons, inputs, icon buttons, notices and desktop tabs 8 px; chips 6 px; the active tab's icon pill 16 px. The parcel drawing itself is the opposite: mitered corners, 2.6 px ink stroke, a square-cornered number stamp, a filled north arrow. The map frame carries a faint 45° hatch over sunk paper, echoing the parcel.

**The Dashed Means Not-Yet Rule.** A dashed edge means "no data yet", never decoration: a parcel without forecast (no hatch, 7/5 dash), the "Sin datos aún" chip, the pending tonight panel, the loading skeleton card, the Phase 1 placeholder.

## Components

### Buttons
Tactile, uppercase and unambiguous; one black action per screen.
- **Shape:** gently rounded (8 px), 52 px tall, 2 px border, survey-face label with an optional leading icon.
- **Primary:** ink fill, white label; hover deepens to #2e2e2c. Used for "Agregar lote", form submit, auth.
- **Secondary:** paper with a 2 px survey-blue border and blue label; hover fills with survey-blue wash. Used for "Editar lote".
- **Danger / Danger solid:** crit outline for "Borrar lote"; solid crit (hover #820016) only for the confirming delete.
- **Press / Disabled:** scale to 0.96 over 120 ms on press; disabled at 60% opacity.

### Chips
- **Style:** transparent fill, 1.5 px border in currentColor, 16 px stroked icon plus uppercase label in the survey face.
- **State:** tone sets the color (ink, wait, crit, caut, ok); pending switches the border to dashed with a clock icon. Phase 1 shows "Pronóstico" (thermometer, ink) and "Sin datos aún" (clock, dashed).

### Cards / Containers
- **Corner Style:** 12 px.
- **Background:** paper; sunk paper while pressed.
- **Shadow Strategy:** flat; hover lift only (see Elevation).
- **Border:** 1 px card rule, darkening to ink on hover; dashed for skeletons.
- **Internal Padding:** 12 px for lote cards, 16 px for the tonight panel.

### Inputs / Fields
- **Style:** 52 px, 1.5 px strong-rule border, 8 px radius, paper fill, 17 px text; bold label above, 16 px ink-2 hint below with example values. Placeholders stay empty of fake data.
- **Focus:** border turns survey blue plus the global 3 px survey-blue outline at 1 px offset; hover darkens the border to ink.
- **Error:** 2 px crit border with a bold crit message led by an icon; form-level errors use the crit-washed alert box with a 2 px crit border.

### Navigation
Three uppercase survey-face tabs (Lotes, Alertas, Perfil), ink-2 at rest. The active tab turns ink, bold, and its icon sits in a 56 x 32 survey-blue pill with a white glyph. Back navigation is a bold blue text link with a chevron, at least 44 px tall. Pronóstico joins as a fourth tab only when its screen exists.

### Parcel Outline (signature)
Each lote drawn as a surveyed parcel in a 120 x 108 viewBox: the field's real boundary when known, otherwise a seeded quadrilateral; 2.6 px mitered ink stroke; hatch fill by severity; a white square stamp holding the parcel number alone in the survey face (34 px, 26 px when longer than two characters); a filled north arrow with "N" in the corner. The area is never stamped; it stays in the meta line. Phase 1 renders the `none` hatch (ink, 1.8 px, 45°, at least 3:1) and the pending form (white fill, dashed outline). It always carries an accessible label naming the parcel and its state.

### Tonight Panel
The detail's reading: a 1 px ruled 12 px card with the chip, the bold question, the display-size value, and the bold ink caveat (max 40ch) directly beneath. Model values sit behind a blue "Ver modelos" disclosure whose chevron rotates 90° over 200 ms; the forecast time sits in fine print below.

### Offline Strip and Notices
Cream fill, 1.5 px ink border, 8 px radius, bold text with an icon, at least 48 px tall; shows when the server produced the data, never the fetch time.

### Empty State
The gaucho's one appearance: an ink line drawing with pink marks, an uppercase survey-face title, a 34ch ink-2 sentence and the primary action, rising in with a 60 ms stagger (420 ms, ease-out).

## Do's and Don'ts

### Do:
- **Do** draw every lote as a parcel outline with its number stamp and north tick, hatched by severity.
- **Do** close every page head with the double title-block rule (3 px ink, 1 px gap, 1 px ink).
- **Do** set titles, labels, chips, buttons, tabs and meta lines in uppercase Barlow Semi Condensed, and every sentence in Atkinson Hyperlegible Next.
- **Do** put a reading's caveat in ink, bold, directly beside the value it qualifies.
- **Do** pair every state color with an icon and a label; use a dashed edge for "no data yet".
- **Do** keep touch targets at 44 px or more (buttons and inputs are 52 px) and reading text at 16 px or more.
- **Do** keep motion short (120 to 200 ms, cubic-bezier(0.2, 0, 0, 1)) and honor reduced motion.

### Don't:
- **Don't** use survey blue for anything that is not interactive; information icons are ink.
- **Don't** set text, fills or state in catastro pink.
- **Don't** use grey below ink-2 for reading text, or washed hatches under 3:1.
- **Don't** convey a state by color alone, or stamp the area inside the parcel.
- **Don't** add a navigation tab for a screen that does not exist yet.
- **Don't** add shadows to resting surfaces; depth is rule weight.
