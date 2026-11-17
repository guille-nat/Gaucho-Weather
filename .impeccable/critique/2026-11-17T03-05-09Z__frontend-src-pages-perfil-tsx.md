---
target: perfil and settings
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/guillenatali/workdir/programming/gaucho-weather-v2/frontend/src/pages/Perfil.tsx"
target_fingerprint: "sha256:b36605ddb235d6a0e9287b6ec0f7f356af4e3f8757015d23c12aaf430aa2cdca"
target_path: /home/guillenatali/workdir/programming/gaucho-weather-v2/frontend/src/pages/Perfil.tsx
timestamp: 2026-11-17T03-05-09Z
slug: frontend-src-pages-perfil-tsx
---
# Critique: Perfil and Suscripción (frontend/src/pages/Perfil.tsx, Suscripcion.tsx)

Method: dual-agent. No browser automation; source-only review. Detector: 0 findings in Perfil.tsx, Suscripcion.tsx, FounderBadge.tsx.

## Heuristics (24/40, Acceptable)
1 Status 2 (toggles not optimistic, no loading/error state on Perfil) · 2 Real world 3 (founder, reglas de alerta, n.º are jargon) · 3 Control 3 · 4 Consistency 2 (three current-password fields; DESIGN.md out of date) · 5 Error prevention 2 (all channels can be turned off; save enabled with no changes; founders offered downgrade) · 6 Recognition 3 · 7 Flexibility 2 · 8 Minimalism 2 (6 equal sections) · 9 Error recovery 2 (raw error, no retry, Suscripcion.tsx:330) · 10 Help 3

## Specificity
Generic settings skeleton; product character carried by copy (voseo, honest manual-plan wording) and the gold numbered founder seal. Suscripción more specific (timeline, pending request).

## Priority issues
- [P1] All alert channels can be switched off silently (Perfil.tsx:179-190). Fix: warn on the last channel; keep in-app inbox as an always-on floor. -> harden
- [P1] Toggles wait for the server (query/hooks.ts:53-58, onSuccess only). Fix: optimistic update with rollback and inline "Guardando…". -> harden
- [P1] Perfil is a flat stack of 6 sections with three password fields (Perfil.tsx:127, 229, 275). Fix: email/password as disclosure rows, alerts first, session and delete last. -> layout, distill
- [P2] Thin loading/error/success states: skeletons, retry, clear stale "Nombre guardado.", disable save until dirty. -> harden
- [P2] Founder and price edge cases: founder line in delete shown to everyone (Perfil.tsx:270); founders offered downgrade without warning; "Pedir este plan" beside "Precio a confirmar" (Suscripcion.tsx:237). -> clarify

## Persona red flags
- Jordan: "Administrar suscripción" vs "Ver planes" unclear; two push concepts.
- Sam: off switch track ~2.4:1 (<3:1); disabled push switch lacks aria-describedby.
- Casey: save buttons left-aligned; destructive and safe buttons side by side at 50%.
- Don Raúl: alerts buried, unresponsive toggles on weak signal, no price.

## Minor
DESIGN.md describes "The Surveyed Parcel" but "Cielo vivo" ships (tokens.css:1-6); history key collision `${at}-${reason}`; duplicated "Tu plan"; off-token colours #ff6a4d, #ffb3a3; credits after the danger zone.

## Questions
1. Alert preferences first in Perfil, or only on Alertas?
2. Should founders be able to downgrade?
3. "Consultar precio" instead of "Pedir este plan" while prices are unset?
