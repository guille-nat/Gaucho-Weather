---
target: perfil and settings
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/guillenatali/workdir/programming/gaucho-weather-v2/frontend/src/pages/Perfil.tsx"
target_fingerprint: "sha256:cdee9e4678c6d0f2734092c69a1b3e1887fc1737439289684268c90907850efb"
target_path: /home/guillenatali/workdir/programming/gaucho-weather-v2/frontend/src/pages/Perfil.tsx
timestamp: 2026-11-17T03-32-43Z
slug: frontend-src-pages-perfil-tsx
---
# Critique: Perfil and Suscripción, after perfil-ux (2026-11-17)

Method: dual-agent with rendered evidence (headless Chrome screenshots at 390 and 1280 px). Detector: 0 findings on source and 0 on both rendered pages via --cdp (element rules included).

## Heuristics (27/40, Acceptable, up from 24)
1 Status 3 (push switch shows the account preference while this phone receives nothing) · 2 Real world 3 (founder, push, regla de alerta) · 3 Control 3 (trial "Darme de baja" ends the trial early without saying so) · 4 Consistency 2 (two "Tu plan" panels; "Cambiar de plan" lands on "Tu suscripción"; delete summary without marker; uneven block spacing) · 5 Error prevention 3 (delete enabled with empty password) · 6 Recognition 3 (loss list generic though usage is known) · 7 Flexibility 2 (trial keep two screens deep; desktop column left-aligned) · 8 Minimalism 3 (features and usage repeat) · 9 Error recovery 3 (delete error does not clear while typing) · 10 Help 2 (no price for Empresa)

## Priority issues
- [P1] Push switch "on" while this phone gets nothing (Perfil.tsx push row vs the .fine line). Fix: device state on the row with an inline "Activar acá". -> harden/clarify
- [P1] Focus lost in the cancel confirm (Suscripcion.tsx CancelPlan; no focus management). Fix: focus the question on open, return focus on "Mejor no", focus status after confirm. -> harden
- [P1/P2] Trial "Darme de baja" ends the trial early and the loss list is generic though `sub.usage` is loaded. -> clarify
- [P2] Trial deadline and its consequence sit a level too deep; link "Cambiar de plan" opens "Tu suscripción". -> layout/clarify
- [P2] Suscripción repeats limits and usage with the same icons. -> distill

## Minor
Block spacing 32 vs 16 px; `.account-plan` asks Onest 700 (not loaded); delete button enabled with empty password and stale error; literals #ffb3a3, #ff9a85; desktop column left-aligned. Not an issue: the slashed zero is Atkinson Hyperlegible's legibility design.

## Questions
1. Should push for this phone be switched on from Perfil itself?
2. Why is the trial deadline the quietest text on Perfil?
3. Would a productor press "Pedir este plan" with no number on it?
