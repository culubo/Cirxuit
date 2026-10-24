# Design: Editable Values

## Overview
Add live-editable electrical parameters to the inspector. Editing mutates the in-store
board immutably and re-solves synchronously. Originals are captured per board load so a
Reset can restore them and so each field can show a "modified" marker.

## State (Zustand store)
- `originalBoard: Board | null` — deep snapshot captured when a board loads, used for
  "modified" detection and Reset. Never mutated.
- Existing `board` becomes the live, edited copy.
- New actions:
  - `setPartParam(ref, patch)` — immutably apply a partial `ElectricalModel` patch to the
    matching part, re-solve with the current `mcuState`, and store the result.
  - `resetBoard()` — restore `board` from `originalBoard`, re-solve, clear runtime state.
- `setBoard` captures `originalBoard` via `structuredClone`.
- `toggleServoStall` stays; it is a specialised `setPartParam`.

Re-solve on every valid edit keeps currents, warnings, and device state live. The solver
is already pure and synchronous, so this is a direct call — no worker needed for edits
(edits are not user code; only the Arduino sandbox needs the worker).

## Engineering-notation parsing — `src/ui/parse-eng.ts`
`parseEngineering(input: string): number | null`
- Trim; reject empty.
- Match `^[+]?\d*\.?\d+\s*([pnumkKMG]?)$` (no leading minus — negatives are invalid here).
- Suffix multipliers: p=1e-12, n=1e-9, u=1e-6, m=1e-3, k/K=1e3, M=1e6, G=1e9.
  Note: lowercase `m` = milli, uppercase `M` = mega (SI). `k` and `K` both = kilo.
- Return `null` for anything non-numeric, negative, or out of grammar.
`formatEngineering(value)` renders a canonical editable string (e.g. 220, 4.7k, 1M, 100n)
for display; the raw field keeps what the user typed until blur.

## Per-field editing — `src/ui/ParamField.tsx`
A controlled text input plus optional slider (pot wiper). Props: label, raw string value,
`onCommit(value: number)`, validator, `modified` flag.
- Local draft state; commit on blur/Enter/Tab (the spec uses Tab).
- On commit: parse → if valid, call `onCommit` and clear error; if invalid, set the shared
  error and keep the field showing the bad text but do NOT change the circuit.
- `data-testid="inspector-param-<key>"` per field (ohms, wiper, vf, beta, volts, runOhms,
  stallOhms). A single shared `data-testid="inspector-param-error"` shows the current
  validation message.
- "modified" marker: a small dot/asterisk with `data-testid="param-modified-<key>"` shown
  when the live value differs from the original.

Wiper is a `<input type="range">` (0..1 step 0.01) plus a numeric readout; it is always
valid, so it commits immediately on input.

## Parameter map per model type
Derived in the inspector from `selectedPart.model.type`:
| type          | fields                                    |
| ------------- | ----------------------------------------- |
| resistor      | ohms                                      |
| potentiometer | wiper (slider)                            |
| led / diode   | vf                                        |
| npn           | beta                                      |
| vsource       | volts                                     |
| servo         | runOhms, stallOhms (+ existing stall btn) |

Each field writes back the single changed key via `setPartParam(ref, { ...model, key })`.
`setPartParam` validates the patched model shape matches the part's model type.

## Device state display
The "Selected" summary already renders a label "Selected". Add, directly under it, the
device state for the selected part read from `simResult.deviceStates[ref]`
(on/off/cutoff/active/saturated). Rendering it inside the same container as the "Selected"
label satisfies the e2e locator `getByText("Selected").locator("..")`.

## Warnings test hooks — InspectorPanel
The warnings feed already renders `simResult.warnings`. Update each entry to attach:
- `data-testid="warning-<ref>"` when the warning has a `ref`, and
- `data-testid="warning-<netId>"` when it has a `netId`
(both when it has both). The solver already sets `ref: "D1"` on the overcurrent warning;
its message must contain "overcurrent" (solver change).

## Reset control
A `data-testid="reset-board-button"` in the inspector header calls `resetBoard()`. After
reset, fields reflect originals (so `inspector-param-ohms` reads "220") and the warnings
feed has no `warning-*` children.

## Solver touch-ups (to satisfy acceptance)
- Overcurrent message must contain "overcurrent" (currently "exceeds its 20 mA rating").
  Reword to include the word while keeping "increase R2".
- Everything else (finite results, warnings for valid-but-extreme values) is already
  handled by the review-fix work (gmin, SHORT_OHMS, piecewise-linear states).

## Files
- `src/ui/parse-eng.ts` (new) — parse/format engineering notation.
- `src/ui/ParamField.tsx` (new) — one editable field.
- `src/ui/InspectorPanel.tsx` — parameter section, device state, reset button, warning
  testids.
- `src/store/useStore.ts` — `originalBoard`, `setPartParam`, `resetBoard`, snapshot on
  `setBoard`.
- `src/App.tsx` — uses `setBoard` (already) so the snapshot is captured on load.
- `src/solver/solve.ts` — overcurrent wording.

## Testing
Acceptance is `e2e/edit-values.spec.ts` (unedited) plus `demo.spec.ts` and `biped.spec.ts`.
Add a focused unit test for `parseEngineering` covering 220, 4.7k, 1M, 100n, 1m vs 1M,
and the invalid cases (-5, abc, empty).
