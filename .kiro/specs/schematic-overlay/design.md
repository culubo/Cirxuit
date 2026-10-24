# Design: Schematic Overlay

## Coordinates
Schematic space is millimetres with board axes (+x right, +y down). `schematicFit(board)`
maps it to board space: `s = min((W − 10) / w, (H − 10) / h)` over the board outline's
bounds `W × H` and `size = w × h`; points map as `board = centre + (p − size/2) · s`. Three
space flips y as everywhere else in the scene.

Rotation follows `footprint.toBoard` (counter-clockwise on screen):
`x' = x cos θ + y sin θ`, `y' = −x sin θ + y cos θ`.

## Pin layout (contract for schematic authors)
`symbolPins(part)` returns pad → offset at rotation 0:
| kind | pins |
| --- | --- |
| resistor, capacitor | `pads[0]` (−5, 0), `pads[1]` (+5, 0) |
| led, diode | anode (−5, 0), cathode (+5, 0) |
| potentiometer | endA (−5, 0), endB (+5, 0), wiper (0, −4) |
| npn | B (−4, 0), C (+2, −5), E (+2, +5) |
| vsource | + (0, −5), − (0, +5) |
| servo | posPad (−4, 0), negPad (+4, 0) |
| mcu, connector, unknown | box: pads in data order, first ⌈n/2⌉ down the left at x = −7.62, the rest down the right at x = +7.62, y = (i − (k−1)/2) · 2.54 |

Kind comes from `part.kind`, so a part keeps its symbol whatever model it uses (the biped
controller is `kind: mcu` with a resistor model: it draws as a two-pin box).

## Layer
`SchematicOverlay` sits in `SceneRoot` at `z = 34 mm · explode` (function layer is 22).
`fade = smoothstep(0.6, 1.0, explode)`; overall alpha `A = fade · shown · opacity`. Contents:
- translucent dark plane over the board outline (`0.72 · A`);
- one textured plane per symbol (canvas, white lines, ref + value), tinted cyan when
  highlighted, faded when dimmed;
- wires as screen-space lines coloured by `v / vmax`, cyan and thicker when highlighted;
- an InstancedMesh of particles along the wires;
- `LabelSprite` voltage labels for the primary focused nets only.
Tethers are one `LineSegments` in world space with RGBA vertex colours, positions updated
each frame from the symbol centre down to the part centre on the component layer. Nothing
in the frame loop allocates.

## Focus (two-way highlight)
`focusOf(board, target)` with `target = hover ?? selection`:
- part → primary part; nets = its non-ground nets (ground only if it has nothing else);
  parts = every part on those nets.
- net → primary net; parts = parts with a pad on it.
`SceneRoot` uses it for part dimming and `NetHighlight` (board traces); the overlay uses it
for symbols, wires, tethers, labels. Highlighted = primary items (symbol + tether of the
primary part, wires of the primary nets); dimmed = outside the focus.

Store: `hover`, `setHover`; `Selection` gains `{ kind: "net"; netId }`; `showSchematic`
(default true) and `schematicOpacity` (default 0.9).

Hover sources: symbol planes and wire pick-ribbons (overlay), `PartModel` (pointer over/out),
`TracePicker` (an invisible plane just above the top copper, and one under the bottom copper
once exploded, finding the nearest trace under the pointer), and the DOM mirror. A trace
hover never replaces a part hover.

## Current direction
`flow.ts`: for a net, sources are the pads where a branch's `toPad` sits on the net (current
leaves a part into the net) and sinks are `fromPad`s. `orientSegments` runs Dijkstra from the
sources over the net's segments and orients each segment from its nearer-to-source end. Both
`CurrentParticles` (tracks, pad positions) and the overlay (wires, symbol pins) use it, which
also fixes board particles that previously ran backwards on some nets.

## DOM mirror
`SchematicMirror` renders in the viewport when the board has a schematic. `layer-schematic`
carries `data-visible`, `data-fade`, `data-opacity`, and is `hidden` unless the layer is shown
(toggle on and explode > 0.6). Items are 4 px transparent buttons (so they can be hovered
and clicked) with `data-highlighted`. One `schematic-wire-<netId>` per net.

## Controls
`SceneControls` adds the toggle and opacity slider for boards with a schematic, plus a hint
to explode past 60% when the layer is on but not yet visible.

## Camera
`AutoFitCamera` adds headroom for the raised layer on boards with a schematic.

## Testing
Unit: `schematicFit`, `symbolPins` (every kind, rotation), `focusOf`, `orientSegments` and
the demo board's LED_A direction. Screenshots inject an inline schematic for the demo board
through the dev-only store handle (`window.__cxStore`), since the real data isn't in yet.
