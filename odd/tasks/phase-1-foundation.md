# Phase 1 — Foundation
Objective: new repo with CI, Docker, login, fields ("lotes") with location, an offline-capable mobile-first PWA, and forecast/observation archiving from day one.
Branch: `feat/phase-1-foundation` · Delivery: ask-on-risk (forecast > 400 lines; chain strategy pending) · Test runners: pytest (backend), Vitest + Playwright (frontend).

## Specs
- **S1 — Phase 1 scope** (from `Doc/plan-reescritura.md`, Fases): "Repo nuevo, CI, Docker, login, lotes con ubicación, PWA que funcione con mala señal".
- **S2 — Design process** (L1): "usa todas las skills que tenes a disposicion de diseño en la config global".
- **S3 — Mobile first** (L1): "recorda que es movile first". The primary user is on a phone, outdoors, in full sun, one-handed (PRODUCT.md).
- **S4 — Field data model** (from `Doc/reglas-agronomicas.md`, Decisiones): a field stores its exact location; crop and sowing date are optional.
- **S5 — Archive from day one** (from `Doc/plan-reescritura.md`, Decisiones): "el backtesting arranca con datos propios: pronósticos guardados desde la Fase 1 y observaciones horarias del SMN".
  - Assumption: the archive covers the field grid cells plus the SMN reference stations Rosario, Venado Tuerto and Marcos Juárez Aero.
- **S6 — Auth** (assumption, open to change): email and password with server-side session cookies (httpOnly, CSRF).
  - Why: avoids the JWT refresh race of v1.
  - Phone or WhatsApp code login stays for Phase 3.

## Tasks
| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S2, S3 | inline | in progress | Visual-world decision page |
| T2 | S1 | pending | pending | Repo scaffold, Docker Compose, CI |
| T3 | S1, S4, S6 | pending | pending | Backend: auth + fields API |
| T4 | S5 | pending | pending | Backend: forecast and observation archiver |
| T5 | S1, S2, S3, S4, S6 | pending | pending | Frontend PWA: login, my fields, add field (map/GPS), offline |
| T6 | S1 | pending | pending | Doc/ updated per feature |

## Log
- L1 (2026-11-03, user, verbatim): "si arranca y usa todas las skills que tenes a disposicion de diseño en la config global, recorda que es movile first"
- L2 (2026-11-03): repo created at `~/workdir/programming/gaucho-weather-v2`.
  - The name was chosen by Claude because the user did not give one; it can be renamed.
  - `Doc/` and `PRODUCT.md` were copied from v1, with Product Purpose updated.
- L3 (2026-11-03): Impeccable direction roll for the Operate mode surface "Mis lotes".
  - Assigned: "Catálogo de remate". Pick: "Ruta nacional". Competitive challenger: "Banda amarilla". Canon offered.
  - Decision page served; waiting for the user's choice.
