# Circxit

[![CI](https://github.com/culubo/Cirxuit/actions/workflows/ci.yml/badge.svg)](https://github.com/culubo/Cirxuit/actions/workflows/ci.yml)

[Open the live demo](https://circuit-xray.vercel.app/) · [Video script](docs/demo-video-script.md) · [Hackachusetts submission notes](docs/hackachusetts-submission.md)

Circxit makes a robot's control board physically and electrically legible, so a
developer can understand and validate the hardware their firmware runs on. Pull the board
apart into its layers, click any part to see what it connects to and how much current it
draws, run Arduino-style firmware, and watch the simulated voltages, currents, and
warnings update live.

Built for the robotics track: see where current flows, which rails sag under load, and
when a stalled actuator will brown out the controller — before it happens in the field.

## What it does

- **Exploded 3D board + schematic** — inspect the physical stack, then open the logical circuit view beside the fabrication layers.
- **Inspect anything** — click a part for its value, a plain-language blurb, its function
  block, and live per-branch current.
- **DC solver** — modified nodal analysis with piecewise-linear LEDs, diodes, and NPN
  transistors; plain-language warnings for overcurrent, reverse-biased LEDs, floating
  inputs, shorts, and rail brownouts.
- **Firmware, live** — an Arduino-style API (`pinMode`, `digitalWrite`, `digitalRead`,
  `analogRead`, `log`) runs in a sandboxed worker; pin states feed straight into the solver.
- **Portable projects** — export an editable `.circxit.json` containing the design, generated PCB, and sketch; import it later to continue working, or export a PCB-only JSON snapshot.
- **Power budgets under load** — the biped power board's four servos can be stalled
  one-click to watch the battery rail collapse and the rail warning fire.

## Built-in boards

- **LED driver demo** (default) — the automated demo path: an MCU drives an NPN that
  switches an LED, plus a potentiometer on an ADC input.
- **Biped power (concept)** — a 2S LiPo feeding four leg servos and a controller through
  the battery's internal resistance and a fuse; stall the servos to brown out the rail.
- **Robot controller (assembly demo)** — watch placement and inspect the assembled board.
- **Microduck Robot HAT (reference)** — an imported four-layer board from [Pollen Robotics' published KiCad design](https://github.com/pollen-robotics/elec_RPI_Robot_HAT). This is a layout reference, not an electrical simulation. The separate RK3566 compute board is represented by a CAD stand-in; see [hardware notes](docs/microduck-hardware.md).

Switch between them with the board selector in the top-left.

## Develop

```bash
npm install
npm run dev        # Vite dev server
npm run test       # Vitest unit suite (solver, runtime, board validation)
npm run build      # typecheck + production build
npx playwright test  # end-to-end demo path
```

## Architecture

| Module      | Responsibility                                                        |
| ----------- | --------------------------------------------------------------------- |
| `model/`    | `board-model.ts` shared types, built-in board JSON, board registry    |
| `solver/`   | pure MNA solver, piecewise-linear iteration, warnings                 |
| `runtime/`  | sandboxed firmware execution in a worker, Arduino-style `McuApi`      |
| `scene/`    | 3D board, parts, tracks, selection                                    |
| `builder/`  | editable PCB document, generated Board, project import/export          |
| `ui/`       | inspector, code editor, board switcher, servo stall toggle            |

The solver is pure and synchronous. The runtime runs user code off the main thread
(browser module worker, or Node `worker_threads` under tests) and calls the solver for
`analogRead`.
