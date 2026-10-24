/**
 * Guides: short, ordered walkthroughs per board. Each step says what to do and
 * why, names the control it needs (by data-testid, so the guide can point at
 * it), and has a check that ticks it off from live app state.
 */
import { CUSTOM_BOARD_ID } from "../builder/doc";
import type { Problem } from "../build/problems";
import { currentCode, useStore } from "../store/useStore";

type State = ReturnType<typeof useStore.getState>;

export interface GuideContext {
  s: State;
  problems: Problem[];
}

export interface GuideStep {
  id: string;
  title: string;
  detail: string;
  /** data-testid of the control this step uses. */
  target?: string;
  done: (ctx: GuideContext) => boolean;
}

export interface Guide {
  title: string;
  intro: string;
  steps: GuideStep[];
}

const amps = (s: State, ref: string): number => s.simResult?.branches.find((b) => b.ref === ref)?.amps ?? 0;
const ohms = (s: State, ref: string): number | null => {
  const m = s.board?.parts.find((p) => p.ref === ref)?.model;
  return m?.type === "resistor" ? m.ohms : null;
};
const stalledCount = (s: State): number =>
  s.board?.parts.filter((p) => p.model?.type === "servo" && p.model.stalled).length ?? 0;
const hasWarning = (s: State, key: string): boolean =>
  s.simResult?.warnings.some((w) => w.ref === key || w.netId === key) ?? false;
const docHas = (s: State, kind: string): boolean => s.builderDoc.parts.some((p) => p.kind === kind);

const DEMO: Guide = {
  title: "LED driver demo",
  intro: "A microcontroller pin switches an LED through a transistor. Follow the steps to see how your code becomes current.",
  steps: [
    {
      id: "demo-inspect",
      title: "Inspect the transistor",
      detail: "Click Q1 in the Parts list. The inspector explains what it does and shows the voltage on each pad. Everything not on Q1's nets dims on the board.",
      target: "part-Q1",
      done: ({ s }) => s.selection?.kind === "part" && s.selection.ref === "Q1",
    },
    {
      id: "demo-run",
      title: "Run the sketch",
      detail: "Press ▶ Run (or ⌘/Ctrl + Enter). digitalWrite(8, HIGH) turns Q1 on, about 12 mA flows through the LED, and particles show the current's path.",
      target: "run-button",
      done: ({ s }) => amps(s, "D1") > 0.01,
    },
    {
      id: "demo-slow",
      title: "Slow it down",
      detail: "Set Speed to Slow and run again, or press ⏭ Step. The highlighted line is the pin call being applied, and the circuit re-solves after each one.",
      target: "step-button",
      done: ({ s }) => s.slowRuns > 0,
    },
    {
      id: "demo-explode",
      title: "Look inside the board",
      detail: "Drag Explode to pull the board apart into its fab layers: silkscreen, solder mask, copper, and the FR-4 core.",
      target: "explode-slider",
      done: ({ s }) => s.explode > 0.5,
    },
    {
      id: "demo-break",
      title: "Break it on purpose",
      detail: "Select R2 and set its value to 10. The LED now draws far more than its 20 mA rating, and the warning tells you what to change. Reset board puts it back.",
      target: "part-R2",
      done: ({ s }) => (ohms(s, "R2") ?? 220) < 50 && hasWarning(s, "D1"),
    },
    {
      id: "demo-error",
      title: "See a build error",
      detail: "Change digitalWrite(8, …) to digitalWrite(99, …). The build check underlines it, lists it in Problems, and Run refuses until it's fixed.",
      target: "build-status",
      done: ({ problems }) => problems.some((p) => p.source === "code" && p.severity === "error"),
    },
  ],
};

const BIPED: Guide = {
  title: "Biped power board",
  intro: "Four leg servos share one battery. Stalled servos draw heavy current through the battery's internal resistance and drag the rail down.",
  steps: [
    {
      id: "biped-inspect",
      title: "Inspect a servo",
      detail: "Click J2 in the Parts list. It's a 25 Ω load while running and about 3 Ω when stalled.",
      target: "part-J2",
      done: ({ s }) => s.selection?.kind === "part" && s.selection.ref === "J2",
    },
    {
      id: "biped-stall-two",
      title: "Stall two servos",
      detail: "With a servo selected, press Stall. Do it for two servos and watch VBAT on pad 1 fall.",
      target: "stall-toggle",
      done: ({ s }) => stalledCount(s) >= 2,
    },
    {
      id: "biped-brownout",
      title: "Brown out the rail",
      detail: "Keep stalling until VBAT drops below 6.0 V. The rail warning fires: below this, the 5 V regulator drops out and the controller resets.",
      target: "warning-feed",
      done: ({ s }) => hasWarning(s, "VBAT"),
    },
    {
      id: "biped-recover",
      title: "Shed load until it recovers",
      detail: "Release servos one at a time. The warning clears once enough load is gone; that's your power budget.",
      target: "stall-toggle",
      done: ({ s }) => s.guideDone.includes("biped-brownout") && !hasWarning(s, "VBAT"),
    },
  ],
};

const BUILD: Guide = {
  title: "Build your own board",
  intro: "Place parts, wire pads together, then run firmware on the board you made. Or load the blink starter to see a finished one.",
  steps: [
    {
      id: "build-mode",
      title: "Open Build PCB",
      detail: "Switch to Build PCB in the top bar. You edit My board here; the built-in boards stay as they are.",
      target: "mode-build",
      done: ({ s }) => s.mode === "build",
    },
    {
      id: "build-supply",
      title: "Place a 5 V supply and a microcontroller",
      detail: "Click 5 V supply in the palette, then click on the board. Do the same for Microcontroller.",
      target: "palette-vsource",
      done: ({ s }) => docHas(s, "vsource") && docHas(s, "mcu"),
    },
    {
      id: "build-led",
      title: "Add a resistor and an LED",
      detail: "An LED needs a resistor in series to limit its current. 330 Ω gives about 8 mA from a 5 V pin.",
      target: "palette-led",
      done: ({ s }) => docHas(s, "resistor") && docHas(s, "led"),
    },
    {
      id: "build-wire",
      title: "Wire it up",
      detail: "Press W (or the Wire tool), click a pad, then another pad. Wire J1 + to U1 VCC, J1 − to U1 GND, D8 → resistor → LED anode, LED cathode → GND. Amber rings mark pads still unwired.",
      target: "tool-wire",
      done: ({ s }) => s.builderDoc.wires.length >= 5,
    },
    {
      id: "build-checks",
      title: "Pass the board checks",
      detail: "The Board checks list shows what is still wrong: missing ground, unpowered MCU, floating pads. Fix the errors until it says the board passes.",
      target: "board-status",
      done: ({ s, problems }) =>
        s.boardId === CUSTOM_BOARD_ID && s.builderDoc.parts.length > 0
        && !problems.some((p) => p.source === "board" && p.severity === "error"),
    },
    {
      id: "build-run",
      title: "Run it",
      detail: "Switch to Simulate and press ▶ Run. digitalWrite(8, HIGH) lights your LED if it's wired to D8.",
      target: "run-button",
      done: ({ s }) =>
        s.boardId === CUSTOM_BOARD_ID
        && (s.board?.parts.some((p) => p.model?.type === "led" && amps(s, p.ref) > 0.001) ?? false)
        && /digitalWrite/.test(currentCode(s)),
    },
  ],
};

export function guideFor(boardId: string | null): Guide | null {
  switch (boardId) {
    case "demo-board": return DEMO;
    case "biped-power-board": return BIPED;
    case CUSTOM_BOARD_ID: return BUILD;
    default: return null;
  }
}
