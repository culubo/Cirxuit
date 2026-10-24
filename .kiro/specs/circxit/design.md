# Design: Circxit

## Stack
- Vite + React + TypeScript (strict)
- three.js via @react-three/fiber, @react-three/drei, @react-three/postprocessing (bloom)
- Monaco editor (or CodeMirror 6 if bundle size hurts)
- Zustand for app state
- Vitest for solver and parser tests, Playwright for the demo-path test
- Deploy on Vercel

## Modules
| Module | Responsibility | Depends on |
|---|---|---|
| `model/` | `board-model.ts` types, demo board JSON | nothing |
| `solver/` | MNA build, piecewise linear iteration, warnings | model |
| `runtime/` | sandboxed user code (Web Worker), McuApi, timeouts | model, solver |
| `scene/` | board, layers, parts, tracks, particles, explode animation | model, sim result |
| `ui/` | inspector panel, code editor, toolbar, warnings feed | everything via store |
| `import/` (stretch) | .kicad_pcb S-expression parser to Board | model |

Data flow: user action -> store -> solver.solve(board, mcuState) -> SimResult -> scene + ui. The solver is pure and synchronous.

## Solver
1. Nodes are nets. Ground net is the reference.
2. Stamp linear elements: resistors, pots (two resistors split at wiper), voltage sources (extra MNA row), MCU output pins (ideal source of 0 V or vcc behind outputOhms), MCU inputs (1 Mohm to ground).
3. Nonlinear parts get a guessed state. LED/diode: off = open, on = source vf + rOn. NPN: cutoff, active (Ib from vbe, Ic = beta * Ib as a controlled source), saturated (vbe source B-E, vceSat source C-E).
4. Solve with dense Gaussian elimination and partial pivoting (fine for under 100 nodes).
5. Check each guessed state for consistency, flip inconsistent ones, repeat. Cap at 30 iterations, then return ok = false.
6. Derive branch currents, orient them so amps >= 0, generate warnings.

## Demo board (hand-authored JSON, the only board the demo depends on)
- J1: 5 V supply (vsource) on +5V and GND
- U1: MCU, vcc 5 V, 10-bit ADC, pins D8 (digital) and A0 (analog_in)
- R1 1k: D8 -> Q1 base
- Q1 2N3904 (beta 100, vbe 0.7, vceSat 0.2): emitter GND
- D1 red LED (vf 2.0, rOn 10 ohm) and R2 220 ohm: +5V -> R2 -> D1 -> Q1 collector
- RV1 10k pot: +5V to GND, wiper -> A0 (user drags a slider in the inspector)
- C1 100 nF: +5V to GND near U1 (decoupling placed next to the MCU supply pin)
- Function blocks: Power, Microcontroller, LED driver, Sensor input

Expected values (tests assert these within 5 percent):
- D8 HIGH: Q1 saturated, I(D1) about 12.2 mA, I(base) about 4.2 mA
- D8 LOW: Q1 cutoff, I(D1) about 0
- RV1 wiper 0.5: A0 about 2.5 V, analogRead about 512

## Visual language (not "AI-looking")
Theme: glowing circuit blueprint. A backlit board in a dark room: deep navy ground, a fine dot grid, electric-cyan traces with a soft halo, pads and via rings that glow.
- Background deep navy (#050b18), not pure black. No purple gradients, no glassmorphism cards, no emoji.
- One accent for current and selection (electric cyan #4fd8ff), one for warnings (amber), one for danger (red).
- Parts are dark, near-black bodies so the lit artwork stays the hero; the MCU gets a faint cyan core glow.
- Numbers in a monospace face (JetBrains Mono or IBM Plex Mono) with real units and sensible precision: 12.2 mA, 4.98 V.
- UI chrome is thin, dense, and quiet. The 3D scene is the hero.
- Motion has purpose: explode uses an eased spring, selection dims the rest in 200 ms, particles carry meaning (direction and magnitude).
- Copy is short, specific, and human. Every blurb is written for the demo board by hand.

## Scene details
- Board: FR4 substrate box, green solder mask with slight clearcoat, copper as metallic PBR, white silkscreen text.
- Layers separate along +z with the explode factor; thin vertical guide lines connect pads to their tracks when exploded.
- Parts are rounded boxes with real-ish colors (black ICs, tan resistors, clear LED lens) and floating ref labels.
- Current particles: one InstancedMesh, particles parameterized along each track polyline, speed and spacing from |I|, additive blend + bloom.
- Environment lighting from drei, soft contact shadows.

## Quality gates
- Typecheck and unit tests run on every save (Kiro hook).
- Playwright test walks the demo path and fails on any console error.
- Error boundary around the canvas; a solver failure shows a message, never a blank screen.
