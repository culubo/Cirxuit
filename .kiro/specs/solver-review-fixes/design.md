# Design: Solver review fixes

## Scope and investigation

The failing cases are in the pure solver at `src/solver/solve.ts`. Use the existing failing assertions in `src/solver/__tests__/review.test.ts` to drive each fix. Keep board schema and rendering unchanged unless a failing acceptance case demonstrates a need.

Investigate NPN stamping and state transitions together. The cutoff case produces a collector voltage above the 5 V supply, and the weak-base case allows collector current above β × base current. Check current-source signs, MNA source-current orientation, state consistency tests, and how transistor branch currents are derived before choosing a correction.

Treat a `null` pad net as an open terminal, not as ground. Check diode/LED stamps, state checks, and branch-current reporting. Keep the already passing zero-ohm short handling finite.

At DC, a capacitor contributes no conductance. A net connected only to its open terminal can leave an unconstrained row in the MNA matrix. Identify and exclude or safely resolve such isolated nodes while preserving a clear failure for real shorts or other invalid circuits.

Build warning text from the actual part ref and physically correct remedial action. Avoid hard-coded `U1` and inverted resistor advice.

## Verification

Run `npx vitest run src/solver/__tests__/review.test.ts` after each focused fix. Then run all solver tests, the 210-case sweep, `npm run typecheck`, and `npm run e2e`. Re-run `npm run build` before considering the bugfix complete.
