# Requirements: Schematic Overlay

Track: Robotics. The core of the project: the circuit's schematic drawn over the physical
board in the 3D view, so a developer can see which symbol is which part and which wire is
which trace, with live voltages and current on both.

Data comes from `Board.schematic` (optional). Boards without it show neither the layer nor
its controls. Schematic data for the built-in boards is authored elsewhere; validation of it
is owned by `scripts/validate-board.ts`.

## Requirement 1: Placement
1. THE SYSTEM SHALL draw the schematic as the topmost layer, above the function layer.
2. WHEN the explode value passes 0.6 THE SYSTEM SHALL fade the schematic in, reaching full
   visibility at 1.0. Below 0.6 it is not drawn and not interactive.
3. THE SYSTEM SHALL draw the schematic on a translucent dark plane covering the board.

## Requirement 2: Alignment
1. THE SYSTEM SHALL scale the schematic uniformly (aspect ratio preserved) to fit inside the
   board outline with a 5 mm margin on every side, centred over the board.

## Requirement 3: Symbols
1. Each symbol SHALL be drawn crisply to a canvas texture in white lines: resistor zigzag,
   capacitor plates, diode triangle with bar, LED as a diode with two emission arrows, NPN
   with an emitter arrow, potentiometer with a wiper arrow, voltage source as a battery,
   servo as M in a circle, MCU (and any other multi-pin part) as a box with labelled pins.
2. Each symbol SHALL show its ref and value next to it, upright at any rotation.
3. Pin offsets relative to the symbol centre at rotation 0 (schematic mm, +y down):
   - two-pin parts (resistor, capacitor, diode, LED): pin 1 (−5, 0), pin 2 (+5, 0);
     for diodes and LEDs pin 1 is the anode.
   - potentiometer: end A (−5, 0), end B (+5, 0), wiper (0, −4).
   - NPN: B (−4, 0), C (+2, −5), E (+2, +5).
   - voltage source: + (0, −5), − (0, +5).
   - servo: 1 (−4, 0), 2 (+4, 0); pin 1 is the servo's + terminal.
   - MCU and other box symbols: pins spaced 2.54 mm down each side.
4. A symbol's rotation SHALL rotate its pins and lines about its centre.

## Requirement 4: Linking
1. THE SYSTEM SHALL draw a thin tether from each symbol to its physical part's centre while
   the schematic is visible.
2. WHEN the user hovers or selects a symbol, schematic wire, part, or board trace THE SYSTEM
   SHALL highlight its counterparts in both views and dim everything else, using the existing
   selection dimming. Hover takes precedence over selection while it lasts.
3. WHEN the user clicks a symbol THE SYSTEM SHALL select that part in the inspector.
4. WHEN the user clicks a schematic wire or a board trace THE SYSTEM SHALL select its net.

## Requirement 5: Live data
1. THE SYSTEM SHALL tint each schematic wire by its net voltage: 0 V dim, the highest voltage
   on the board brightest.
2. THE SYSTEM SHALL flow current particles along schematic wires with the same current,
   speed, direction, and on/off and electron-flow toggles as the board's particles.
3. Particles on both the board and the schematic SHALL flow in the direction of conventional
   current: from where current enters a net to where it leaves.
4. THE SYSTEM SHALL show a net voltage label only for the hovered or selected net.

## Requirement 6: Controls
1. Scene controls SHALL include a Schematic show/hide toggle (`schematic-toggle`, default on)
   and an opacity slider (`schematic-opacity`), only for boards with a schematic.

## Requirement 7: Test hooks
1. A hidden DOM mirror SHALL expose `layer-schematic`, `schematic-symbol-<REF>`,
   `schematic-wire-<netId>` (one per net), and `tether-<REF>`, each with
   `data-highlighted="true"` when highlighted and `"false"` otherwise.
2. Mirror symbols and wires SHALL respond to hover and click like their 3D counterparts.

## Non-functional
- All existing unit and e2e tests keep passing; `e2e/schematic.spec.ts`, once written, passes
  unedited.
- No per-frame allocation in the overlay's animation loop.
