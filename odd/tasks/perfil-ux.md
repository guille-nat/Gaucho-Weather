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

## Tasks
| ID | Specs | Unit | Route | Risk | Status | Commit |
|---|---|---|---|---|---|---|
| T1 | S1 | Regenerate DESIGN.md | delegated (impeccable-documenter, runs while T2 is written) | none | done | b28c879 |
| T2 | S2 | Alert switches: warning, optimistic, a11y | inline | none | done (RED 5) | c36c6a5 |
| T3 | S3 | Perfil layout | inline | none | done (RED 3) | 6424806 |
| T4 | S4 | States on Perfil and Suscripción | inline | none | done (RED 5) | 28dfa88 |
| T5 | S5 | Founder and price copy | inline | none | done (RED 4 + 1) | 6d16a1d, see L6 |
| T6 | S6 | Polish + critique | inline | item 4 (concurrency, found in polish) | polish done; re-critique and verifier running | ae26298, 28f4893, 78b873d |

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

