# Design: IDE Workbench and PCB Builder

## Layout
```
┌ TopBar: logo · board select · [Simulate | Build PCB] ·············· Guide · ? ┐
├ Editor pane (420px) ┬ Viewport (flex) ───────────────────┬ Inspector (340px) ┤
│ toolbar: Run Step   │ Simulate: 3D scene + guide card +  │ Simulate: parts,  │
│   Pause Restart     │   scene controls                   │   selected, live  │
│   Speed · build chip│ Build: 2D board editor + toolbar   │   currents, warns │
│ CodeMirror editor   │                                    │ Build: palette,   │
│ Console|Problems|   │                                    │   properties,     │
│   Trace             │                                    │   board checks    │
├ StatusBar: build · board checks · solver · step n/N · mode · board ───────────┤
```
The guide card floats in the viewport's top-left so it never covers the editor,
inspector, or run controls. All existing testids move with their components.

## Trace (runtime)
`executeProgram` instruments the sketch with acorn: before every statement in a
statement list it inserts `__cx_at(line);`, which updates `currentLine`. Each API call
appends a `TraceEvent` (`pinMode | digitalWrite | digitalRead | analogRead | log`) with
that line. State changes go through one exported `applyTraceEvent`, used both while
executing and while replaying, so the two cannot drift. The trace is capped at 5000
events (flagged as truncated). On a throw, `errorLine = currentLine`.
`RunResult` gains `trace`, `traceTruncated`, `errorLine`.

## Playback
Store `playback = { trace, index, playing, base, final }`. `applyIndex(i)` folds
events `0..i` over `base` with `applyTraceEvent`, re-solves, and sets mcuState,
simResult, and the logs seen so far. Speed 0 (Instant) applies `final` directly — this is
the default, so existing behaviour (and the demo e2e) is unchanged. A timer in
`useRunner` advances while `playing`. Step runs first when there is no trace for the
current code revision. The editor shows the current event's line with a
decoration.

## Build checks
`checkSketch(code, board)` parses with acorn (no execution). It reports syntax errors,
unknown callees (declared names are collected from the whole AST, plus API names and a
small list of JS globals), argument counts, literal pins resolved against the board's
MCU, level and mode literals, `delay()`, `console.log`, and endless loops with no
`break`/`return`. Every problem carries `from/to` offsets for editor lint and a line for
the Problems panel. `checkBoard(board, {overlap})` is the electrical rules check. Run is
blocked by code errors only; board problems are shown but do not block.

## Builder
`BuilderDoc = { name, widthMm, heightMm, parts: PlacedPart[], wires: Wire[] }`.
`PlacedPart = { ref, kind, x, y, rotation, model }`; templates define footprint, body,
pad offsets, default model, ref prefix. `docToBoard` rotates pad offsets, unions wired
pads into nets (net naming: `GND` for a supply's −, `+5V` for its +, otherwise `N1…`),
routes each wire as a straight or L-shaped F.Cu track, and emits a normal `Board`. The
doc persists in localStorage. Selecting "My board" or entering Build mode uses this
board; edits re-derive and re-solve the 3D board live.

The 2D editor is SVG with a viewBox in millimetres, a 1.27 mm snap grid, tools
Select/Wire/Delete, palette placement, drag to move, R to rotate, Delete to remove, Esc
to cancel. Unwired pads get an amber ring.

## Camera
`useAutoFitCamera` frames the board's bounds at a ~35° tilt when the board changes and
points OrbitControls at the board center.

## Testing
Unit: trace recording, checkSketch cases, checkBoard cases, docToBoard nets/tracks, and
the blink starter solving to a lit LED. Acceptance: existing three e2e specs unedited.
Screenshots via the harness for the IDE, a slowed run, the problems panel, and the builder.
