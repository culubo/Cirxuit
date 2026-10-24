import type { Board, ElectricalModel, McuState, Pad, Part, PartKind } from "../../model/board-model";

export type Connection = readonly [pad: string, netId: string | null];

export function part(
  ref: string,
  kind: PartKind,
  model: ElectricalModel,
  connections: readonly Connection[],
  value = "",
): Part {
  return {
    ref,
    value,
    kind,
    footprint: "",
    position: { x: 0, y: 0 },
    rotationDeg: 0,
    side: "top",
    body: { w: 0, h: 0, height: 0 },
    pads: connections.map(([number, netId]): Pad => ({
      number,
      netId,
      position: { x: 0, y: 0 },
      sizeMm: { w: 0, h: 0 },
      layers: ["F.Cu"],
    })),
    model,
  };
}

export function board(parts: Part[], groundNetId = "GND", name = "Solver fixture"): Board {
  const netIds = new Set<string>([groundNetId]);
  for (const component of parts) {
    for (const pad of component.pads) {
      if (pad.netId !== null) netIds.add(pad.netId);
    }
  }
  return {
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    outline: [],
    thicknessMm: 1.6,
    copperLayers: ["F.Cu"],
    parts,
    nets: [...netIds].map((id) => ({
      id,
      name: id,
      pads: parts.flatMap((component) =>
        component.pads.filter((pad) => pad.netId === id).map((pad) => ({ ref: component.ref, pad: pad.number })),
      ),
    })),
    tracks: [],
    vias: [],
    blocks: [],
    groundNetId,
  };
}

export const d8High: McuState = { modes: { D8: "output", A0: "input" }, outputs: { D8: 1 } };
export const d8Low: McuState = { modes: { D8: "output", A0: "input" }, outputs: { D8: 0 } };
export const noOutputs: McuState = { modes: {}, outputs: {} };

export function sourceResistorBoard(): Board {
  return board([
    part("J1", "vsource", { type: "vsource", volts: 5, posPad: "+", negPad: "-" }, [["+", "+5V"], ["-", "GND"]], "5V"),
    part("R1", "resistor", { type: "resistor", ohms: 1000 }, [["1", "+5V"], ["2", "GND"]], "1k"),
  ], "GND", "source-resistor");
}

export function dividerBoard(): Board {
  return board([
    part("J1", "vsource", { type: "vsource", volts: 5, posPad: "+", negPad: "-" }, [["+", "+5V"], ["-", "GND"]], "5V"),
    part("R1", "resistor", { type: "resistor", ohms: 10_000 }, [["1", "+5V"], ["2", "MID"]], "10k"),
    part("R2", "resistor", { type: "resistor", ohms: 10_000 }, [["1", "MID"], ["2", "GND"]], "10k"),
  ], "GND", "divider");
}

export interface DemoOptions {
  r2Ohms?: number;
  reverseLed?: boolean;
  floatingInput?: boolean;
}

export function demoBoard(options: DemoOptions = {}): Board {
  const r2Ohms = options.r2Ohms ?? 220;
  const ledConnections: Connection[] = options.reverseLed
    ? [["A", "Q1_C"], ["K", "LED_A"]]
    : [["A", "LED_A"], ["K", "Q1_C"]];
  return board([
    part("J1", "vsource", { type: "vsource", volts: 5, posPad: "+", negPad: "-" }, [["+", "+5V"], ["-", "GND"]], "5V"),
    part("U1", "mcu", {
      type: "mcu", vcc: 5, gndPad: "GND", vccPad: "VCC", adcBits: 10,
      pins: [
        { name: "D8", pad: "D8", capabilities: ["digital"], outputOhms: 25 },
        { name: "A0", pad: "A0", capabilities: ["analog_in"], outputOhms: 25 },
      ],
    }, [["VCC", "+5V"], ["GND", "GND"], ["D8", "D8"], ["A0", options.floatingInput ? "FLOAT" : "A0"]], "Arduino"),
    part("R1", "resistor", { type: "resistor", ohms: 1000 }, [["1", "D8"], ["2", "Q1_B"]], "1k"),
    part("Q1", "npn", {
      type: "npn", beta: 100, vbe: 0.7, vceSat: 0.2,
      basePad: "B", collectorPad: "C", emitterPad: "E",
    }, [["B", "Q1_B"], ["C", "Q1_C"], ["E", "GND"]], "2N3904"),
    part("R2", "resistor", { type: "resistor", ohms: r2Ohms }, [["1", "+5V"], ["2", "LED_A"]], `${r2Ohms}`),
    part("D1", "led", { type: "led", vf: 2, rOn: 10, anodePad: "A", cathodePad: "K", color: "red" }, ledConnections, "red"),
    part("RV1", "potentiometer", {
      type: "potentiometer", ohms: 10_000, wiper: 0.5,
      endA: "1", endB: "3", wiperPad: "2",
    }, [["1", "+5V"], ["2", "A0"], ["3", "GND"]], "10k"),
  ], "GND", "demo");
}
