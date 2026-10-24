# Requirements: PCB Realism

Track: Robotics. The scene must read as a real printed circuit board a developer would
recognise, not a toy of colored blocks. Rework rendering for realism while preserving every
existing interaction and all data-testid selectors.

## Requirement 1: Board artwork as baked textures
User story: As a developer, I want the board to look like real PCB fab artwork.
1. THE SYSTEM SHALL render each board layer from a 2D canvas texture (not extruded 3D
   strips), baked at ~80 px/mm, capped at 4096 px on the longest side.
2. Substrate SHALL show FR4 with a tan edge on the board sides, at the board thickness
   (1.6 mm default).
3. Copper layers SHALL draw traces at true widths with rounded ends/joins, pads with a
   silver HASL finish, and vias as rings with dark drilled holes.
4. Solder mask SHALL be dark glossy green (~#0f3d22), semi-transparent so copper reads as
   slightly raised lighter lines, with mask openings over pads showing bare metal.
5. Silkscreen SHALL draw white part outlines, reference designators, pin-1 dots, LED/diode
   polarity marks, the board name, and four corner mounting holes.
6. Materials SHALL use the texture for color plus a roughness map so pads are shinier than
   mask.
7. WHEN exploded THE SYSTEM SHALL render each layer as its own transparent textured plane.

## Requirement 2: Procedural part models
User story: As a developer, I want components that look like the real parts.
1. THE SYSTEM SHALL build part meshes procedurally by kind/footprint at true dimensions,
   with realistic (non-pastel) materials:
   - 0603/0805 resistor: black body, metallic end caps, white value code.
   - capacitor: tan/brown ceramic body, metallic ends.
   - LED 0805: white body, translucent colored lens that glows with current.
   - SOT-23: black body, 3 gull-wing leads. TQFP-32: black body, 8 leads/side, pin-1 dot.
   - pin header / servo connector: black plastic, gold square pins.
   - potentiometer: blue body, white adjuster. battery/power connector: realistic housing.
2. An unknown footprint SHALL fall back to a plain black body at its `body` dimensions.

## Requirement 3: Camera framing
1. THE SYSTEM SHALL frame the board to fill ~80% of the canvas area left of the inspector.
2. THE SYSTEM SHALL use a 3/4 view tilted ~35° from top-down.
3. WHEN the board changes THE SYSTEM SHALL auto-fit the new board.

## Requirement 4: Function layer
1. THE SYSTEM SHALL draw a floating translucent outline around each function block's parts.
2. Block labels SHALL render in the block's accent color.
3. The function layer SHALL be visible when the explode factor exceeds ~0.3.

## Requirement 5: Preserved behaviour
1. All existing data-testids keep working (parts list, inspector, warnings, board switcher,
   explode slider, particle/electron toggles, stall toggle, reset).
2. Explode, current particles, and selection dimming keep working.
3. All unit tests and the three acceptance e2e specs stay green.
4. The scene holds interactive frame rates on the demo board.

## Requirement 6: Visual acceptance
1. Capture screenshots: demo (default, D8 HIGH, exploded) and biped (default, 2 servos
   stalled); compare against design.md and report each path.
