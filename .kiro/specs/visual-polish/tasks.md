# Tasks: Visual Polish

- [x] 1. Design tokens + install bloom deps
  - `src/ui/tokens.ts` with the lab palette and `blockColor()`; added
    `@react-three/postprocessing` + `postprocessing`.
  - _Requirements: 6.1, 6.2_

- [x] 2. PBR materials + lighting with offline fallback
  - `src/scene/materials.ts`, `src/scene/Lighting.tsx` (Environment + ContactShadows,
    error boundary → FallbackLights). Wired into BoardScene; materials on slab,
    tracks, parts.
  - _Requirements: 2.1, 2.2, 2.3, 6.2_

- [x] 3. Explode slider + spring
  - Store `explode`; `useExplodeSpring`; layer groups in SceneRoot; `explode-slider`.
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 4. Current particles + bloom + electron-flow toggle
  - `src/scene/CurrentParticles.tsx` (one InstancedMesh), EffectComposer+Bloom, store
    `showParticles`/`electronFlow`, `particle-toggle` + `electron-flow-toggle`.
  - _Requirements: 3.1–3.5_

- [x] 5. LED glow + selection focus
  - LED emissive ∝ current; selection dim/undim eased within ~200 ms for parts and
    tracks via per-frame lerp.
  - _Requirements: 4.1, 5.1, 5.2_

- [x] 6. Monospace numbers via formatQuantity
  - Selected-part pad voltages render through `formatQuantity`. Branch-current list
    stays in mA (monospace, 3 s.f.) to keep the e2e current parser valid.
  - _Requirements: 6.3_

- [x] 7. Verify
  - tsc clean; 59 unit tests pass; demo/biped/edit-values e2e all green; build OK.
  - _Requirements: all / Non-functional_

## Notes
- Verification used a scripted Playwright screenshot harness (`e2e/screenshot.spec.ts`)
  checked against design.md after each task, since the Playwright MCP server, though
  present in `.kiro/settings/mcp.json`, was not exposed as a tool this session.
- Branch-current readouts are intentionally fixed to mA so the acceptance specs'
  mA-based current parser keeps working; pad voltages use SI-prefixed `formatQuantity`.
