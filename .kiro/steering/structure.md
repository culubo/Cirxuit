---
inclusion: always
---

# Project structure

- `src/model/board-model.ts`: shared board, electrical, runtime, and simulation types. Geometry is in millimeters with the origin at the board's top left, +x right and +y down; electrical values use volts, amps, ohms, and farads.
- `src/model/*.json`: board data. Keep pad and net membership, track endpoints, function-block references, and model pad names consistent with `scripts/validate-board.ts`.
- `src/solver/`: pure DC solving and warnings; `src/solver/__tests__/` contains focused tests and the stress sweep.
- `src/runtime/`: worker-backed user code execution and MCU API.
- `src/scene/`: one small component per 3D scene object. `src/ui/` contains the inspector and presentation formatting.
- `src/store/useStore.ts`: shared application state. `src/App.tsx` loads the demo board and composes the scene and inspector.
- `src/import/`: KiCad parser. `e2e/` contains Playwright coverage of the demo path.
- `.kiro/specs/`, `.kiro/steering/`, and `.kiro/hooks/` contain the project plans, always-loaded guidance, and agent hooks.

Import shared types from `src/model/board-model.ts`. Keep solver data flow as board plus MCU state to `SimResult`, then present that result through the store, scene, and UI. Follow `quality.md` when changing any module.
