# Design: Visual Polish

## Dependencies
- `@react-three/postprocessing` + `postprocessing` — bloom. Bundled, not a runtime asset.
- No animation library: the explode spring and selection dim are hand-rolled with
  `useFrame` lerps (critically-damped feel), avoiding an extra dependency.
- drei `Environment` with `preset` downloads an HDR at runtime — the only allowed external.
  Wrap it in an error boundary that swaps in a `FallbackLights` rig on failure.

## Design tokens — `src/ui/tokens.ts`
A single source of palette truth. Plain TS object (works in both DOM styles and three
materials).

```
tokens = {
  bg: "#0b0f14",            // near-black blue-gray
  panel: "#0d1117",
  phosphor: "#7ec8a0",      // current accent
  amber: "#e0a84a",         // warn
  danger: "#d9463b",        // danger
  silk: "#e8eef0",          // white silkscreen
  solderMask: "#1a5e20",
  copper: "#c88a3a",
  // function-block accents (design-token names used in board JSON `color`)
  "accent-power": "#d9a441",
  "accent-mcu": "#5a9bd4",
  "accent-driver": "#7ec8a0",
  "accent-sensor": "#b07ad4",
  "accent-warn": "#e0a84a",
}
```
A `blockColor(token)` helper resolves a FunctionBlock.color token (e.g. "accent-power")
to a hex; unknown tokens fall back to a neutral.

## Explode — store + layers
- Store: `explode: number` (0..1) + `setExplode`; `showParticles`/`electronFlow` toggles;
  `selection` already exists.
- `LAYER_Z_BASE` per layer (substrate, B.Cu, F.Cu, components, function). The explode
  factor multiplies a per-layer offset so layers fan out along +z.
- An `useExplodeSpring(target)` hook lerps a ref value toward `target` each frame
  (factor ~0.15) and returns it; components read it to position their group. Settles
  well under 1 s and adds no per-frame allocation.
- Explode slider in the UI: `data-testid="explode-slider"` (range 0..1).

## Materials — `src/scene/materials.ts`
Factory helpers returning memoised materials:
- `solderMaskMaterial()` → `MeshPhysicalMaterial` green, clearcoat ~0.6, roughness ~0.5.
- `copperMaterial()` → `MeshStandardMaterial` metalness 1, roughness ~0.35, copper tint.
- `silkMaterial()` → white, mostly rough.
Parts keep per-kind colors but move to `MeshStandardMaterial` with sensible metalness.

## Lighting — `src/scene/Lighting.tsx`
- `<Environment preset="city" />` from drei inside a small error boundary
  (`EnvironmentOrFallback`). On throw/suspense error, render `FallbackLights`
  (hemisphere + key directional + fill) so the scene is always lit.
- `<ContactShadows>` from drei under the board for soft grounding.

## Current particles — `src/scene/CurrentParticles.tsx`
- Build a flat list of conducting segments from `board.tracks` whose net carries current
  (look up |I| from `simResult` by matching a branch on the track's net; approximate per
  net using the max branch magnitude on that net).
- One `InstancedMesh` sized to the total particle budget (cap ~600 for fps). Each particle
  is assigned to a segment; its phase advances each frame by `speed ∝ sqrt(|I|)` and wraps
  0..1 along the segment. Spacing/among-count ∝ |I| so bigger currents look denser/faster.
- Direction: conventional current flows from the higher-potential pad to the lower; the
  `electronFlow` toggle negates the velocity sign.
- Material: additive blend, phosphor color, depthWrite false. Bloom via
  `<EffectComposer><Bloom/></EffectComposer>` in the scene.
- Particle budget and update are O(N) with no per-frame allocation (reuse a dummy Object3D
  and a single matrix).

## LED glow
`PartMesh` for an LED reads its branch current from `simResult` and sets
`emissiveIntensity ∝ clamp(I / ratedI)`. Emissive color is the LED's own color.

## Selection focus
- A selection set = selected part ref + the refs/nets electrically attached (pads sharing
  a net with the selected part). Tracks on those nets stay bright; others dim.
- Each mesh lerps its material `opacity`/`emissiveIntensity` toward a target
  (selected→1, dimmed→~0.25) in `useFrame`; the eased transition completes within 200 ms
  (lerp factor chosen for ~12 frames at 60 fps). Materials become `transparent` while
  dimming.

## Keeping tests green
- All DOM testids (`part-*`, `inspector-*`, `warning-*`, `code-editor`, `run-button`,
  `board-switcher`, `stall-toggle`, `reset-board-button`) are untouched; new controls add
  `explode-slider`, `particle-toggle`, `electron-flow-toggle`.
- The 3D changes are WebGL-only and do not alter the DOM the e2e specs query.
- `formatQuantity` stays the number formatter; its tests are unaffected.

## Verification
After each task: typecheck, run the unit suite, and capture a headless screenshot of the
app (via a Playwright screenshot run) to compare against the design.md visual language
(near-black bg, phosphor/amber/red accents, metallic copper, lit scene). If the Playwright
MCP is available it is used for interactive screenshots; otherwise a scripted screenshot
run produces the PNGs.

## Files
- `src/ui/tokens.ts` (new), `src/scene/materials.ts` (new),
  `src/scene/Lighting.tsx` (new), `src/scene/CurrentParticles.tsx` (new),
  `src/scene/useExplodeSpring.ts` (new), `src/ui/SceneControls.tsx` (new).
- Edit: `BoardScene.tsx`, `SceneRoot.tsx`, `BoardSlab.tsx`, `TrackStrip.tsx`,
  `PartMesh.tsx`, `store/useStore.ts`, `App.tsx`.
