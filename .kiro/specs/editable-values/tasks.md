# Tasks: Editable Values

- [x] 1. Engineering-notation parser
  - Add `src/ui/parse-eng.ts` with `parseEngineering` and `formatEngineering`.
  - Unit test in `src/ui/__tests__/parse-eng.test.ts`: 220, 4.7k, 1M, 100n, 1m≠1M,
    and invalid (-5, abc, "", "1.2.3").
  - _Requirements: 1.3, 1.4, 2.1_

- [x] 2. Store: originals, param edits, reset
  - Capture `originalBoard` (structuredClone) in `setBoard`.
  - Add `setPartParam(ref, model)` that re-solves; add `resetBoard()`.
  - _Requirements: 1.2, 2.2, 5.2, 5.3_

- [x] 3. ParamField component
  - Add `src/ui/ParamField.tsx`: controlled input (+ optional slider), commit on
    blur/Enter/Tab, shared error, modified marker.
  - testids: `inspector-param-<key>`, `inspector-param-error`, `param-modified-<key>`.
  - _Requirements: 1.1, 1.4, 2.1, 2.3, 5.1_

- [x] 4. Inspector parameters section
  - Render the field set per selected part's model type; wire each to `setPartParam`.
  - Pot wiper as a slider that commits live.
  - _Requirements: 1.1, 1.2, 3.1, 3.2_

- [x] 5. Device state + reset button + warning testids
  - Show `simResult.deviceStates[ref]` under the "Selected" label.
  - Add `reset-board-button` calling `resetBoard()`.
  - Warnings feed: add `warning-<ref>` and `warning-<netId>` testids.
  - _Requirements: 4.1, 5.2, 6.1, 6.2_

- [x] 6. Solver wording
  - Overcurrent message contains "overcurrent".
  - _Requirements: 6.3_

- [x] 7. Verify acceptance
  - `tsc --noEmit`, full unit suite, then `e2e/edit-values.spec.ts`, `demo.spec.ts`,
    `biped.spec.ts` all green.
  - _Requirements: all / Non-functional_
