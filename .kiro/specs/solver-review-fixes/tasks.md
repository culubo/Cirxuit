# Tasks: Solver review fixes

- [ ] 1. Inspect NPN MNA stamping, state decisions, and branch-current extraction; fix the cutoff and weak-base cases in `review.test.ts` without weakening assertions.
- [ ] 2. Make disconnected LED or diode terminals electrically open and report zero branch current for the unconnected case.
- [ ] 3. Handle nets that are isolated by a DC-open capacitor so the valid capacitor case solves without masking real singular circuits.
- [ ] 4. Correct overcurrent resistor guidance and use the actual MCU ref in floating-input warnings.
- [ ] 5. Run `npx vitest run src/solver/__tests__/review.test.ts`, all solver tests including `sweep.test.ts`, `npm run typecheck`, `npm run e2e`, and `npm run build`; check off each implementation task after its acceptance tests pass.
