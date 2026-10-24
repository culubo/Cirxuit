# Design: PCB Realism

## Strategy
Replace the per-track/per-part box scene with:
1. A **textured board stack** — one quad per layer, each textured by a 2D canvas baked
   from the board data. This is both far more realistic and far cheaper than hundreds of
   extruded strips.
2. **Procedural part meshes** keyed by footprint/kind.
3. An **auto-fit 3/4 camera**.
4. A **function-layer** of floating outlines, shown when exploded.

All geometry stays in board space (mm). Board origin is top-left, +x right, +y down
(KiCad). Three space flips Y (+y up); a single helper converts.

## Texture baking — `src/scene/bake/` (pure, unit-testable where possible)
`bakeBoardTextures(board): BakedLayers` returns `{ width, height, pxPerMm, substrate,
copperTop, copperBottom, mask, silk, roughness }` where each is an `HTMLCanvasElement`
(or `OffscreenCanvas` when available). Resolution: `pxPerMm = min(80, 4096 / maxDimMm)`.

Drawing (all in a canvas 2D context, mm→px scaled):
- **substrate**: fill FR4 tan `#b89a5a` darkened, with a subtle fibre-weave noise.
- **copper (per layer)**: for each track, stroke a round-capped, round-joined line at
  `widthMm`. For each pad on that layer, fill its rect/rounded-rect (rounded for SMD) in
  HASL silver `#d8d8e0` with a soft specular gradient; round pads for through-hole. For
  each via, fill a copper ring with a dark center (drill).
- **mask**: fill the whole outline dark glossy green `#0f3d22` at ~0.82 alpha; then punch
  transparent openings over every pad (slightly larger than the pad) so bare metal shows.
  The mask is drawn as its own plane above copper; semi-transparency lets copper read as
  faint raised lines.
- **silk**: white. Part courtyard/outline rectangles, `ref` text (monospace), a pin-1 dot
  near pad "1"/first pad, polarity bars for led/diode (stripe at cathode), the board name
  along the bottom edge, and 4 corner mounting-hole rings.
- **roughness map**: grayscale — mask area mid-high roughness (~0.6), pad openings low
  roughness (~0.2 → shinier), silk high. Used as `roughnessMap` on the mask/copper planes.

Textures are memoised per board (rebuild only when `board.id` changes) to keep fps up.

## Board stack — `src/scene/BoardStack.tsx`
Replaces `BoardSlab` + `TrackStrip`. Builds planes sized to the board bounding box:
- substrate: a thin extruded box (outline) 1.6 mm thick with FR4 side color; top face uses
  the substrate texture.
- copperBottom plane at z just above the substrate bottom; copperTop just below the top
  face; mask plane on top of copper; silk plane on top of mask.
- Collapsed (explode 0) the planes are nearly coincident so it reads as one solid board.
- Exploded: `useExplodeSpring` fans the planes along +z (reuse existing hook). Each layer
  plane is transparent (`transparent`, `alphaTest`) so openings and board outline cut out.

The board outline clips every layer (a `THREE.Shape` from the outline → plane geometry, or
an alpha cutout baked into each texture matching the outline).

## Procedural parts — `src/scene/parts/`
`PartModel({ part, dimmed, glow })` dispatches on `footprintFamily(part)` which parses the
`footprint` string (e.g. "Resistor_SMD:R_0603", "Package_TO_SOT_SMD:SOT-23",
"Package_QFP:TQFP-32", "...PinHeader_1x02...", "Potentiometer...", connector) and falls
back to `part.kind`, then to a plain black body.

Sub-components (each a small module returning JSX groups built from primitives):
- `Chip2Terminal` (resistor/cap/led): body box + two end caps; resistor body black with a
  white value-code decal (canvas texture) and metallic caps; cap body tan; led white body +
  a translucent lens mesh whose `emissiveIntensity` tracks `glow` (current).
- `Sot23`: black body + 3 gull-wing legs (small bent boxes).
- `Tqfp`: black body + 8 leads per side + a baked pin-1 dot on top.
- `Header`: black plastic block + gold square pins (one per pad).
- `Pot`: blue body + white adjuster cylinder.
- `PowerConnector`: dark housing block.
Materials via a shared `partMaterials.ts` (black FR4 plastic, gold, metallic cap, ceramic).
No pastels. Parts keep the existing click handler and selection dimming (opacity lerp).

Dimensions: use `part.body` for the overall envelope; lead/cap sizes are proportion-based
constants per family. Pin positions come from `part.pads` (already in board space).

## Camera — `src/scene/useAutoFitCamera.ts`
On board change, compute the board bounding box, place the camera at a 3/4 angle (~35°
from top-down, azimuth ~25°) at a distance that frames the board to ~80% of the *left*
region of the canvas (account for the ~23rem inspector on the right by biasing the target
x and widening distance). Set OrbitControls target to the board center. Uses
`fitCameraToBox` math (fov + aspect). Runs when `board.id` changes.

## Function layer — `src/scene/FunctionLayer.tsx`
For each `board.blocks` entry, compute the AABB of its member parts (+margin), draw a
translucent rounded outline (LineLoop or thin extruded ring) floating above the stack, and
a `Text`/`Html` label in `blockColor(block.color)`. Opacity ramps in as the explode value
passes ~0.3 (read from `useExplodeSpring`).

## Preserving behaviour & tests
- DOM is untouched (all testids are DOM, rendered by InspectorPanel/controls). The scene is
  WebGL-only, so e2e DOM queries are unaffected.
- `CurrentParticles` keeps working (it reads tracks/sim from the store, independent of how
  tracks are drawn). Particle z-planes align to the copper layer offsets.
- Selection dimming: parts and the copper/mask planes lerp opacity as today.
- `SceneRoot` is rewritten to compose BoardStack + PartModels + FunctionLayer, keeping the
  background-click-to-deselect and explode groups.

## Risks / mitigations
- **OffscreenCanvas in tests/SSR**: baking only runs in the browser (inside the Canvas);
  guard with `typeof document`. No baking in unit tests.
- **fps**: textures replace hundreds of meshes (big win). Part lead counts kept modest.
- **Outline cutout**: if per-plane Shape geometry is too costly, bake an outline alpha mask
  into each texture instead.

## Files
New: `src/scene/bake/bakeBoard.ts`, `src/scene/BoardStack.tsx`,
`src/scene/parts/*` (PartModel + families + partMaterials), `src/scene/FunctionLayer.tsx`,
`src/scene/useAutoFitCamera.ts`, `src/scene/valueCode.ts`.
Edit: `SceneRoot.tsx`, `BoardScene.tsx`, `CurrentParticles.tsx` (z-align),
remove reliance on `BoardSlab`/`TrackStrip` (keep files until cutover done).
Acceptance screenshots via `e2e/screenshot.spec.ts`.
