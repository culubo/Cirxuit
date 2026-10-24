# Tasks: PCB Realism

- [ ] 1. Baked board textures + board stack
  - `bake/bakeBoard.ts` (substrate, copper top/bottom, mask, silk, roughness),
    `BoardStack.tsx` (textured planes, outline clip, explode fan). Swap into SceneRoot.
  - Screenshot demo default; check against design.md. CHECKPOINT with user.
  - _Requirements: 1.1–1.7, 5.2_

- [ ] 2. Camera auto-fit
  - `useAutoFitCamera.ts`: 3/4 ~35° view, board fills ~80% left of inspector, auto-fit on
    board change.
  - _Requirements: 3.1–3.3_

- [ ] 3. Procedural parts
  - `parts/PartModel.tsx` + families (chip 2-terminal, SOT-23, TQFP-32, header, pot, power
    connector) + `partMaterials.ts` + value-code decals. Replace PartMesh usage.
  - Keep click selection + dimming + LED glow.
  - _Requirements: 2.1, 2.2, 5.1, 5.2_

- [ ] 4. Function layer
  - `FunctionLayer.tsx`: translucent block outlines + accent labels, visible when
    explode > ~0.3.
  - _Requirements: 4.1–4.3_

- [ ] 5. Verify + visual acceptance
  - tsc, unit suite, three acceptance e2e specs, build. Capture demo (default/D8 HIGH/
    exploded) + biped (default/2 stalled); report paths.
  - _Requirements: 5.3, 5.4, 6.1_
