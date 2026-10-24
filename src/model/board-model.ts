// board-model.ts
// The shared contract. Every module (parser, viewer, solver, runtime, UI) reads and writes these types.
// Units: millimeters for geometry, volts / amps / ohms / farads for electrical values.
// Coordinates: board space, origin at board top-left, +x right, +y down (KiCad convention).

export type Vec2 = { x: number; y: number };

export type CopperLayer = "F.Cu" | "B.Cu" | "In1.Cu" | "In2.Cu";
export type Side = "top" | "bottom";

export interface Board {
  id: string;
  name: string;
  /** A sourced PCB layout whose active electronics are outside the DC solver. */
  simulation?: "reference";
  outline: Vec2[];            // closed polygon from Edge.Cuts
  thicknessMm: number;        // usually 1.6
  copperLayers: CopperLayer[];
  parts: Part[];
  nets: Net[];
  tracks: Track[];
  vias: Via[];
  /** KiCad filled copper polygons, including internal plane layers. */
  zones?: Zone[];
  blocks: FunctionBlock[];    // the "function layer" floating above the board
  groundNetId: string;        // reference node for the solver
  railLimits?: { netId: string; minVolts: number; message: string }[];
  // Optional schematic view of the same circuit. Symbols reference parts by ref;
  // wires are polylines in schematic space (mm, same axes as board space).
  schematic?: {
    symbols: { ref: string; position: Vec2; rotationDeg: number }[];
    wires: { netId: string; points: Vec2[] }[];   // polylines in schematic space, mm
    size: { w: number; h: number };
  };
}

export type PartKind =
  | "resistor"
  | "potentiometer"
  | "capacitor"
  | "led"
  | "diode"
  | "npn"
  | "mcu"
  | "vsource"
  | "servo"
  | "connector"
  | "unknown";

export interface Part {
  ref: string;                // "R1", "U1"
  value: string;              // "1k", "2N3904"
  kind: PartKind;
  footprint: string;
  position: Vec2;
  rotationDeg: number;
  side: Side;
  /** False for a KiCad footprint that is present on copper but not assembled. */
  fitted?: boolean;
  body: { w: number; h: number; height: number }; // mm, used for box rendering
  pads: Pad[];
  model?: ElectricalModel;    // absent means the solver ignores the part
  blurb?: string;             // short human-written "what this does" text
}

export interface Pad {
  number: string;             // "1", "2", "B", "C", "E"
  netId: string | null;
  position: Vec2;             // board space, already rotated
  sizeMm: { w: number; h: number };
  layers: CopperLayer[];
  /** KiCad drill diameter, including unplated mechanical holes. */
  drillMm?: number;
}

export interface Net {
  id: string;
  name: string;               // "GND", "+5V", "/LED_DRIVE"
  pads: { ref: string; pad: string }[];
}

export interface Track {
  netId: string;
  layer: CopperLayer;
  start: Vec2;
  end: Vec2;
  widthMm: number;
}

export interface Via {
  netId: string;
  position: Vec2;
  drillMm: number;
  diameterMm: number;
}

export interface Zone {
  netId: string;
  layer: CopperLayer;
  points: Vec2[];
}

export interface FunctionBlock {
  id: string;
  label: string;              // "LED driver"
  description: string;        // one or two plain sentences
  partRefs: string[];
  color: string;              // design token name, not a raw hex
}

// ---------- Electrical models (DC only for v1) ----------

export type ElectricalModel =
  | { type: "resistor"; ohms: number }
  | { type: "potentiometer"; ohms: number; wiper: number; endA: string; endB: string; wiperPad: string } // wiper 0..1
  | { type: "capacitor"; farads: number }                     // open circuit at DC
  | { type: "vsource"; volts: number; posPad: string; negPad: string }
  | { type: "led"; vf: number; rOn: number; anodePad: string; cathodePad: string; color: string }
  | { type: "diode"; vf: number; rOn: number; anodePad: string; cathodePad: string }
  | { type: "npn"; beta: number; vbe: number; vceSat: number; basePad: string; collectorPad: string; emitterPad: string }
  | { type: "mcu"; vcc: number; gndPad: string; vccPad: string; pins: McuPin[]; adcBits: number }
  // A servo is modelled as a DC resistive load: runOhms when turning freely,
  // stallOhms (much lower) when mechanically stalled and drawing stall current.
  | { type: "servo"; runOhms: number; stallOhms: number; stalled: boolean; posPad: string; negPad: string };

export type PinCapability = "digital" | "analog_in" | "pwm";

export interface McuPin {
  name: string;               // "D8", "A0"
  pad: string;
  capabilities: PinCapability[];
  outputOhms: number;         // driver source resistance, about 25 ohms
}

// ---------- Runtime and simulation ----------

export type PinMode = "input" | "output";

export interface McuState {
  modes: Record<string, PinMode>;      // keyed by pin name
  outputs: Record<string, 0 | 1>;
}

export interface BranchCurrent {
  ref: string;
  fromPad: string;            // conventional current flows fromPad -> toPad
  toPad: string;
  amps: number;               // always >= 0 after orientation
}

export interface SimResult {
  ok: boolean;
  netVoltages: Record<string, number>; // netId -> volts relative to ground
  branches: BranchCurrent[];
  deviceStates: Record<string, "on" | "off" | "saturated" | "active" | "cutoff">;
  warnings: SimWarning[];
  iterations: number;
}

export interface SimWarning {
  severity: "info" | "warn" | "danger";
  ref?: string;
  netId?: string;
  message: string;            // plain language, e.g. "D1 is drawing 41 mA, above its 20 mA rating"
}

// Sandbox API exposed to user code. Arduino-flavored on purpose.
export interface McuApi {
  pinMode(pin: string | number, mode: "INPUT" | "OUTPUT"): void;
  digitalWrite(pin: string | number, level: 0 | 1 | "HIGH" | "LOW"): void;
  digitalRead(pin: string | number): 0 | 1;
  analogRead(pin: string | number): number;   // 0 .. 2^adcBits - 1
  log(...args: unknown[]): void;
}
