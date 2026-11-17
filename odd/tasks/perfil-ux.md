# Perfil UX — fixes from the Perfil and Suscripción critique (24/40, 2026-11-17)
Objective: make alert delivery hard to switch off by mistake, give Perfil a hierarchy, harden its states and fix founder and price copy. Critique: `.impeccable/critique/2026-11-17T03-05-09Z__frontend-src-pages-perfil-tsx.md`.
Branch: `feat/perfil-ux` (stacked on `feat/cuenta-planes-alertas`) · Delivery: ask-on-risk, stacked-to-main (cached) · Runners: Vitest + Testing Library + MSW (frontend).

## Specs
- **S1 — DESIGN.md** (L2: "Regenerarlo ahora"): DESIGN.md describes the shipped "Cielo vivo" system, not "The Surveyed Parcel".
- **S2 — Reliable alerts** (L2: "Avisos confiables"):
  - switching off the last outside channel (push and email) warns that alerts then stay only in the Alertas inbox, which is always on (`delivery.py`: the event row is the inbox entry);
  - the switches move at once (optimistic) and roll back when the save fails, with an inline "Guardando…";
  - the disabled push switch is tied to its explanation (`aria-describedby`);
  - the off switch track reaches 3:1 against its panel.
- **S3 — Perfil layout**: alerts first, then plan and data, then session and delete; email and password changes open one form at a time; save buttons within thumb reach; the downgrade confirm does not put the destructive and the safe button side by side.
- **S4 — States** (L2: "Los 5"): skeletons while `me` loads; an error with "Reintentar" instead of the raw message on Perfil and Suscripción; "Nombre guardado." clears on the next edit; save disabled until something changed; a stable history key.
- **S5 — Founder and price copy**:
  - the founder line in "Borrar cuenta" only for founders;
  - a founder asking to move to Básico is told the truth: they stay founder n.º N and can ask for Productor again (`plans.change_plan` keeps `founder_number`). Assumption: the critique's "Perdés el plan gratis para siempre" is false and is not used;
  - "Administrar suscripción" vs "Ver planes" made distinct;
  - price-unset wording (L6): "Precio a confirmar: te lo pasamos por email antes de aplicar el pedido." on Suscripción.
- **S6 — Polish and re-critique.**
- **S7 — Push on this phone from Perfil** (re-critique P1): with push on and this browser not subscribed, Perfil says so and offers "Activar en este teléfono" with the same flow as Alertas (`useEnablePush`); a browser that blocks notifications is told how to unblock them; a subscribed phone reads "Activadas en este teléfono.".
- **S8 — Focus in the cancel confirm** (P1): opening it moves focus to its question; "Mejor no" returns focus to "Darme de baja"; confirming moves focus to the status line.
- **S9 — Cancel during a trial** (P1/P2): the button and the question say it ends the trial now; the losses are computed from the account's usage instead of conditionals.
- **S10 — Trial deadline on Perfil** (P2): during a trial Perfil says what happens at the end ("Cuando termine pasás a Básico."), and the link to the subscription page is named like the page ("Tu suscripción").
- **S11 — One list of limits on Suscripción** (P2): each limit appears once, with its usage; push and email stay as checks. Plus the delete-account minors: its button stays off without a password, a stale error clears while typing, and its summary shows that it opens.

- **S12 — Modern web guidance** (L12): apply the `modern-web-guidance` guides to these screens:
  - `dialog`: the plan cancel confirm is a native modal `<dialog>` opened with `showModal()`, named by its heading, with `autofocus` on the safe action ("Mejor no") and no hand-written focus return;
  - `accordion`: "Tus datos" rows are `<details>`/`<summary>` (exclusive with `name`, as S3 requires one form at a time; the guide's fallback where `name` is unsupported), with the marker right before the label;
  - `accessible-error-announcement`: these `noValidate` forms move focus to the first invalid field after a failed submit;
  - `switch`: kept as `role="switch"` (what the guide's polyfill does) without the native `switch` attribute or a new dependency.

## Tasks
| ID | Specs | Unit | Route | Risk | Status | Commit |
|---|---|---|---|---|---|---|
| T1 | S1 | Regenerate DESIGN.md | delegated (impeccable-documenter, runs while T2 is written) | none | done | b28c879 |
| T2 | S2 | Alert switches: warning, optimistic, a11y | inline | none | done (RED 5) | c36c6a5 |
| T3 | S3 | Perfil layout | inline | none | done (RED 3) | 6424806 |
| T4 | S4 | States on Perfil and Suscripción | inline | none | done (RED 5) | 28dfa88 |
| T5 | S5 | Founder and price copy | inline | none | done (RED 4 + 1) | 6d16a1d, see L6 |
| T6 | S6 | Polish + critique | inline | item 4 (concurrency, found in polish) | done; verifier blockers fixed in one batch | ae26298, 28f4893, 78b873d, 73c0b2b |
| T7 | S7 | Push on this phone from Perfil | inline | none | done (RED 2) | ac9c4e8 |
| T8 | S8 | Focus in the cancel confirm | inline | none | done (RED 2) | d4d8ee6 |
| T9 | S9 | Cancel during a trial | inline | none | done (RED 2) | d4d8ee6 |
| T10 | S10 | Trial deadline on Perfil | inline | none | done (RED 2) | 3f07af5 |
| T11 | S11 | One list of limits + delete minors | inline | none | done (RED 4) | 884699a |
| T12 | S12 | Cancel confirm as a native modal dialog | inline | none | done (RED 6) | 4876ed2 |
| T13 | S12 | Tus datos rows as details/summary | inline | none | done (RED 2) | 6d4956f |
| T14 | S12 | Focus the first invalid field after a failed submit | inline | none | done (RED 2) | b6c16cc |

Route evidence: T1 is the skill's shipped documenter agent with a disjoint surface (DESIGN.md, `.impeccable/design.*`); T2–T6 share Perfil.tsx and app.css, so they run inline one after another.

## Log
- **L1** (2026-11-17, user, verbatim): "corré todos en orden"
- **L2** (2026-11-17, user answers to the critique): priority "Avisos confiables"; scope "Los 5"; DESIGN.md "Regenerarlo ahora".
- **L3** (2026-11-17): T1 DESIGN.md regenerated as "Cielo vivo" (20 colors, 6 type roles, 12 components); drift recorded, not tokenized.
- **L4** (2026-11-17): T2–T4 done test-first; Vitest 161 passed, eslint and prettier clean, tsc has only the 12 `src/sw.ts` errors already on the base.
  - The critique's "Perfil shows no loading state" was wrong: `RequireAuth` renders the Splash or the OfflineGate (with retry) until `me` exists (`Guards.tsx:13-16`). Only Suscripción needed a skeleton and a retry.
- **L5** (2026-11-17): T5 founder and links done (Vitest 166). The critique's "Perdés el plan gratis para siempre" was false and not used: `change_plan` keeps `founder_number`, so a founder on Básico stays founder and can ask for Productor again. Pending: price-unset wording (user decision).
- **L6** (2026-11-17, user answer): price-unset wording "Precio por email" → "Precio a confirmar: te lo pasamos por email antes de aplicar el pedido." (Suscripción only; the public Planes page keeps "Precio a confirmar"). This is a promise the team keeps by hand: the admin apply action has no price step.
- **L7** (2026-11-17): T6 polish with real screenshots (headless Chrome over CDP, a dev-only user `polish@local.test` created by ORM, outside the founder program).
  - Found a lost update: turning push and email off in a row left one on. Two causes, both fixed test-first: the backend saved every field on PATCH me (ae26298, RED 2, `update_fields`), and the frontend replaced the whole account with whichever answer arrived last (28f4893, RED 1, field-level merge). Screenshots then show both off with the warning, and the DB agrees.
  - Exposed by T2: the switches used to be disabled while saving. Risk: item 4 (concurrency) → independent verifier.
  - Backend tests in the dev container need `--ds=config.settings.test`: the container's `DJANGO_SETTINGS_MODULE` wins over pytest.ini and 20 email tests fail otherwise. pytest 452 passed, Vitest 168 passed.
  - Spacing: the trial "Quedarme con Productor" action got its own group (78b873d).
- **L8** (2026-11-17): independent verifier (item 4): backend `update_fields` holds (no save override, signals or auto_now; empty PATCH still 200). Frontend: 3 blockers caused by T2 (same switch tapped twice ending off the server value on double failure or on a stale answer arriving last; a failure hidden by a later success). One correction batch (73c0b2b): per-switch confirmed value from the newest answered save, shown when none is pending; failure kept in hook state; "Guardando…" while any save is pending. Probes kept as regression tests; recheck limited to them passed 3×; Vitest 171. Scratch removed, dev test user deleted.
- **L9** (2026-11-17): re-critique 27/40 (from 24). Detector clean on source and on both rendered pages. New findings (push for this phone, focus in the cancel confirm, trial cancel copy, trial deadline depth, repeated limits) are new scope, offered to the user.
- **L10** (2026-11-17, user, verbatim, on the re-critique findings): "si encarala"
- **L11** (2026-11-17): second batch T7–T11 done test-first (Vitest 183 passed, eslint clean; tsc only the 12 `src/sw.ts` errors). Commits ac9c4e8, d4d8ee6, 3f07af5, 884699a. Screenshots checked: push on this phone from Perfil, trial chip and "Cuando termine pasás a Básico.", one plan list, trial cancel confirm, delete disabled without password.
  - `planFeatures` gained an optional `limit` tag; /planes is unchanged (its tests pass).
  - Environment, not this change: the host `frontend/node_modules` lacks the `workbox-*` packages declared in package.json, so `vite build` fails on `src/sw.ts` and tsc reports its 12 errors; the container has them. A stale Vite HMR graph broke the dev app once ("does not provide an export named 'Alertas'"); restarting the frontend container fixed it.
- **L12** (2026-11-17, user, verbatim, invoking `/modern-web-guidance`): "utiliza esta skill"
- **L13** (2026-11-17): S12 done with the `modern-web-guidance` guides `dialog`, `accordion`, `accessible-error-announcement` and `switch` (retrieved, not from memory). Vitest 186 passed; tsc and eslint clean apart from `src/sw.ts`.
  - T12 (4876ed2): native modal `<dialog>`; checked in Chrome over CDP: closed = display none, `:modal` on open, focus on "Mejor no", Tab stays inside, Esc closes and focus returns to the button. jsdom has no `showModal`, so `src/test/setup.ts` stubs open/close only.
  - T13 (6d4956f): rows as `details name="account-data"`; jsdom lacks `name` on details, so the guide's toggle fallback runs there; forms mount only while open (one "Contraseña actual" at a time). Screenshot shows the chevron by the label.
  - T14 (b6c16cc): focus the first `[aria-invalid="true"]` after a refused submit on the four Perfil forms.
  - `switch` not applied: native `switch` is Safari-only and the guide's fallback is a polyfill dependency; `role="switch"` already gives what the polyfill sets.

