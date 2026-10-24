# Tasks: Circuit X-Ray

Tasks are ordered so the core loop works end-to-end as early as possible.
Visual polish, KiCad import, and the solver/import test suites are out of scope here.

---

## Phase 0 — Foundations

### Task 1 — Scaffold Vite + React + TypeScript strict [ ]
Initialise the project. Pin exact versions.

**Deliverables**
- `package.json` with exact versions for `three@0.186.1`, `@react-three/fiber@9.8.2`, `@react-three/drei@10.7.9`, `zustand@5.0.16`, `react@19.3.1`, `react-dom@19.3.1`, `vitest@5.0.5`, `@playwright/test@1.64.1`, `vite@8.3.5`, `typescript@7.0.2`
- `tsconfig.json` with `strict: true`, `noUncheckedIndexedAccess: true`, `moduleResolution: bundler`
- `vite.config.ts`
- `playwright.config.ts`
- `src/main.tsx` bootstrapping a bare `<App />`
- `src/App.tsx` rendering a `<div>` placeholder

**Done when:** `tsc --noEmit` and `vitest run` exit 0.

---

### Task 2 — Quality hook: typecheck + Vitest on save [ ]
Wire the quality gate from `quality.md`.

**Deliverables**
- `.kiro/hooks/typecheck-on-save.json` — `PostFileSave` hook matching `\.(ts|tsx)$` that runs `tsc --noEmit && vitest run`

**Done when:** saving any `.ts` file triggers the hook.

---

## Phase 1 — State

### Task 3 — Zustand store [ ]
Central app state; no UI yet.

**Deliverables**
- `src/store/useStore.ts` — Zustand store with slices:
  - `board: Board | null`
  - `mcuState: McuState`
  - `simResult: SimResult | null`
  - `selection: { kind: "part"; ref: string } | { kind: "block"; id: string } | null`
  - Actions: `setBoard`, `setMcuState`, `setSimResult`, `setSelection`
- All types imported from `model/board-model.ts`; no redefinition.

**Done when:** `tsc --noEmit` exits 0; store file exports the hook.

---

## Phase 2 — Solver (pure, no React)

### Task 4 — Demo board JSON [ ]
The only board the demo depends on; hand-authored from the spec.

**Deliverables**
- `src/model/demo-board.json` — Board JSON matching the spec:
  J1 (vsource 5 V), U1 (MCU), R1 (1 k), Q1 (2N3904), D1 (red LED vf=2.0), R2 (220 Ω), RV1 (10 k pot), C1 (100 nF).
  Outline, copperLayers, nets, tracks, pads, function blocks all populated.

**Done when:** JSON parses as `Board` without TypeScript errors.

---

### Task 5 — MNA solver [ ]
Pure synchronous solver. No React, no three.js, no globals.

**Deliverables**
- `src/solver/mna.ts` — builds and solves the MNA matrix with dense Gaussian elimination + partial pivoting
- `src/solver/solver.ts` — `solve(board: Board, mcuState: McuState): SimResult`
  - Stamps resistors, pots (two-resistor split), voltage sources, MCU output pins, MCU input pins, LEDs, diodes (piecewise linear), NPN (cutoff / active / saturated)
  - Nonlinear iteration, max 30 iterations; `ok: false` on non-convergence
  - Generates `SimWarning` for overcurrent, reverse-biased LEDs, floating inputs
- `src/solver/index.ts` re-exporting `solve`

**Done when:** `tsc --noEmit` passes. (Tests are owned by another agent.)

---

## Phase 3 — Runtime

### Task 6 — MCU sandbox runtime [ ]
Runs user code safely; drives the solver.

**Deliverables**
- `src/runtime/worker.ts` — Web Worker entry; receives `{ code: string; board: Board; mcuState: McuState }`, runs user code in a `new Function` sandbox with a 500 ms timeout, posts back `McuState`
- `src/runtime/api.ts` — `McuApi` implementation backed by the current `McuState` + `SimResult`
- `src/runtime/useRuntime.ts` — React hook that owns the Worker, exposes `run(code)` and `stop()`, updates the store

**Done when:** `tsc --noEmit` exits 0.

---

## Phase 4 — Scene (minimal)

### Task 7 — Minimal r3f scene [ ]
Board outline as flat slab, parts as boxes, tracks as flat strips. Click to select.

**Deliverables**
- `src/scene/BoardScene.tsx` — `<Canvas>` wrapper, `<OrbitControls>`, ambient + directional light
- `src/scene/BoardSlab.tsx` — flat `<mesh>` extruding the board outline polygon, plain green `<meshStandardMaterial>`
- `src/scene/PartMesh.tsx` — `<mesh>` box from `part.body` dims, positioned and rotated in board space, plain material, `onClick` calls `setSelection`
- `src/scene/TrackStrip.tsx` — flat `<mesh>` strip per `Track` on the active layer, coloured by layer (copper yellow / copper red for back)
- `src/scene/SceneRoot.tsx` — composes all of the above from store state

**Done when:** `tsc --noEmit` passes and the scene renders the demo board with clickable parts.

---

## Phase 5 — Inspector panel (minimal)

### Task 8 — Inspector panel [ ]
Shows part details and live sim values when a part is selected.

**Deliverables**
- `src/ui/InspectorPanel.tsx` — reads `selection` and `simResult` from store; shows ref, value, kind, blurb, function block label, and per-pad voltage/current from simResult; collapses to nothing when nothing is selected
- `src/ui/App.tsx` (or update `src/App.tsx`) — layout: scene fills the viewport, inspector overlays bottom-right

**Done when:** clicking a part in the scene shows its data in the inspector, `tsc --noEmit` passes.

---

## Phase 6 — Wire it together

### Task 9 — Connect solver to scene [ ]
Load demo board on startup, run solver, push simResult to store.

**Deliverables**
- `src/App.tsx` — on mount, `import('./model/demo-board.json')`, call `solve(board, initialMcuState)`, dispatch `setBoard`, `setSimResult`
- Error boundary around `<BoardScene>` — catches render errors, shows a plain message

**Done when:** the full loop works: demo board loads → solver runs → inspector shows live voltages on pad click.

---

## Phase 7 — Code editor

### Task 10 — Code editor + run button [ ]
Let the user type code and drive the board.

**Deliverables**
- `src/ui/CodeEditor.tsx` — CodeMirror 6 editor (or Monaco) with `javascript` syntax highlighting; "Run" button
- On Run: calls `runtime.run(code)`, which updates `mcuState`, triggers re-solve, store updates propagate to scene + inspector
- On runtime error: message appears in the inspector, scene stays intact

**Done when:** typing `digitalWrite(8, 1)` and clicking Run causes the solver to re-solve with D8 HIGH.

---

## Phase 8 — Current particles (minimal)

### Task 11 — Current particle system [ ]
Animated particles along tracks proportional to branch current.

**Deliverables**
- `src/scene/CurrentParticles.tsx` — `InstancedMesh`, one instance per particle; positions parameterised along each `Track` polyline; speed and spacing from `|I|` via simResult; phosphor-green material
- Toggle state in store: `showParticles: boolean` + `setShowParticles`
- LED brightness: `src/scene/PartMesh.tsx` emissive intensity proportional to `simResult.branches` current through the LED

**Done when:** `tsc --noEmit` passes and particles move in the scene.

---

## Out of scope in this agent

- `src/solver/__tests__/` — owned by another agent
- `src/import/` — owned by another agent
- PBR materials, bloom, explode animation, environment lighting — visual polish pass later
- Playwright test — after scene is stable
