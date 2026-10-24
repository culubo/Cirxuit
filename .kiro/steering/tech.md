---
inclusion: always
---

# Technology stack and constraints

- Vite, React 19, and strict TypeScript build the browser app. Zustand holds board, simulation, selection, and runtime UI state.
- three.js, React Three Fiber, and drei render the 3D board. Keep rendering concerns out of the solver.
- `src/solver/solve.ts` is a pure, synchronous DC solver. It consumes the shared `Board` and `McuState` types and returns `SimResult`; it must not depend on React, three.js, or global state. Cover every solver change with Vitest.
- `src/runtime/` executes the Arduino-style user API in a worker and feeds pin states to the solver.
- Vitest covers model, solver, runtime, importer, and formatting behavior. Playwright covers the demo path in `e2e/demo.spec.ts`.
- Use `npm run typecheck`, `npm test`, `npm run e2e`, and `npm run build` as applicable. Board JSON can be checked with `scripts/validate-board.ts` and the model tests.

`src/model/board-model.ts` is the authoritative contract, including units and coordinate conventions. Do not duplicate its types. Follow `quality.md` for code, visual, and demo requirements.
