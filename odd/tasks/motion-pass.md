# Motion pass — animations and transitions that explain state, across the app
Objective: add purposeful motion with the installed design skills (impeccable animate, transitions-dev, make-interfaces-feel-better, modern-web-guidance), on top of the existing tokens (`--dur-fast` 120 ms, `--dur-base` 200 ms, `--ease-out`).
Branch: `feat/cielo-animado` (continues; the user has not pushed it yet) · Delivery: ask-on-risk · Runner: Vitest + Testing Library + MSW (frontend).

## Specs
- **S1 — Request** (L1 verbatim): "utiliza las skills de diseño que tienes instaladas globalmente y añade animaciones y transiciones"
- **S2 — Motion thesis** (assumption: chosen by the agent, the request names no surface):
  - Focal moment: changing tab, the glass lens travels from the old tab to the new one while the page cross-fades (View Transitions, same-document).
  - Feedback: a saved place travels from "Recientes" to "Guardados" (View Transition per row); the sky pause cross-fades its icons; the crops and cancel dialogs open and close with fade and scale.
  - Data: when the forecast replaces the loading state, it enters in three staggered steps and the 7-day rain bars grow one after another. A forecast already in the cache appears at once.
  - Disclosure: the Perfil rows, the account-danger block and "models-more" open and close by height where `::details-content` is supported.
- **S3 — Rules for every effect:**
  - every effect has a `prefers-reduced-motion` path: fade only or nothing spatial;
  - transitions list exact properties, never `all`;
  - each effect degrades to the current behaviour without support;
  - no new dependency;
  - motion is never the only cue.

## Tasks
| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S2 focal, S3 | inline | done | lens test RED (0 lenses) → GREEN; browser: `-ua-view-transition-group-anim-tab-lens` |
| T2 | S2 feedback, S3 | inline | done | browser: dialog `opacity`, `scale`; icon swap CSS; row travel via startViewTransition |
| T3 | S2 data and disclosure, S3 | inline | done | bars and reveal tests RED → GREEN; browser: `forecast-in`, `rain-grow`, details `height` |

Route evidence: no Writer trigger (CSS and small TSX hooks, sequential and small), so the parent writes inline. Forecast ~300 authored lines.

## Log
- **L1** (2026-11-17, user, verbatim): "utiliza las skills de diseño que tienes instaladas globalmente y añade animaciones y transiciones"
- **L2** (2026-11-17): skills loaded: impeccable (animate.md, craft-floor.md), transitions-dev, make-interfaces-feel-better, and the modern-web-guidance guides `same-document-transitions`, `animate-to-from-top-layer`, `accordion` and `motion`.
  - The transitions.dev token scale is not imported: the project already has its own motion tokens, and a second scale would compete with them.
  - Focus after a tab change stays on the tab link, which survives the navigation, so the guide's focus-routing rule is met without moving focus.
- **L3** (2026-11-17): S2 revised before T3.
  - The planned "hero cross-blur on place change" cannot work: picking a place navigates from Buscar to Inicio, which remounts it, and the page change already explains the swap.
  - It is replaced by the skeleton-reveal pattern: the forecast enters only when it replaces the loading state.
  - The star "pop" became the row travelling between lists. A pop would also play frozen under a view transition, because snapshots pause animations.
- **L4** (2026-11-17): T1–T3 done.
  - React Router's `viewTransition` prop did nothing here. It is deprecated, and the screenshot at 140 ms showed the final state with no transition.
  - Moved to React 19.3's `<ViewTransition>`: `BrowserRouter` 7.18.5 wraps each navigation in `React.startTransition`.
  - A boundary around `<Outlet>` painted the page above the tab bar mid-transition, as the screenshot showed. The lens alone triggers the transition, and the page fades as the root.
  - The reveal first replayed on every return to Clima: Inicio re-asks the location and shows the skeleton for a moment. It is now gated on a visible wait of at least 120 ms (`REVEAL_AFTER_MS`).
  - Browser checks over CDP:
    - tab change: `-ua-view-transition-group-anim-tab-lens` plus the root fade;
    - forecast held for 600 ms on the Docker stack: `forecast-in` and `rain-grow`;
    - Perfil details: `height` and `content-visibility`;
    - crops dialog: `opacity` and `scale`.
  - Checks: Vitest 235 passed; eslint, prettier and tsc clean (only the known `src/sw.ts` errors).
