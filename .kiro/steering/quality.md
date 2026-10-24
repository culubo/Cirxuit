---
inclusion: always
---

# Quality bar for Circxit

This project is judged on polish. Follow these rules in every change.

## Code
- TypeScript strict. No `any`. Import shared types from `model/board-model.ts`; never redefine them.
- The solver is pure: no React, no three.js, no globals. Every solver change ships with a Vitest test.
- No placeholder text, lorem ipsum, TODO strings, or fake numbers anywhere in the UI.
- Never swallow errors. Surface them in the warnings feed with a plain sentence.
- Keep components small. One file per scene object.

## Visual
- Follow the "lab instrument at night" language in design.md. Use the design tokens, never raw hex values in components.
- No purple gradients, glassmorphism, emoji, or generic card grids.
- All numbers use the monospace font, real units, and 3 significant figures.
- Every animation is eased and under 400 ms, except the explode and particles.

## Demo safety
- The demo path (load, explode, click part, run code, LED lights) must keep passing the Playwright test.
- Do not add features after 6 PM. Fix bugs and polish only.

## Test selectors for e2e/biped.spec.ts
- board-switcher (listbox trigger), board-option-biped-power-board (option)
- part-J2 ... part-J5 in the parts list
- stall-toggle in the inspector for servo parts
- warning-feed container; each warning item warning-<netId>
