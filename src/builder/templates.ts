/**
 * Part templates for the PCB builder: what each palette item is physically
 * (footprint, body, pad layout) and electrically (default model, value label).
 *
 * Pad offsets are package-local, board orientation (mm, +y down), before
 * rotation. Footprint strings are real KiCad names so the 3D part models and
 * the board artwork classify them like any other board.
 */
import type { CopperLayer, ElectricalModel, PartKind } from "../model/board-model";
import { formatEngineering } from "../ui/parse-eng";

export type TemplateKind =
  | "vsource"
  | "mcu"
  | "resistor"
  | "led"
  | "capacitor"
  | "npn"
  | "potentiometer"
  | "servo";

export interface PadTemplate {
  number: string;
  dx: number;
  dy: number;
  w: number;
  h: number;
  through: boolean;
  /** Short role shown on hover, e.g. "anode". */
  role: string;
}

export interface PartTemplate {
  kind: TemplateKind;
  partKind: PartKind;
  label: string;
  hint: string;
  refPrefix: string;
  footprint: string;
  body: { w: number; h: number; height: number };
  pads: PadTemplate[];
  defaultModel: () => ElectricalModel;
  blurb: string;
}

const SMD: CopperLayer[] = ["F.Cu"];
const THT: CopperLayer[] = ["F.Cu", "B.Cu"];
export const layersFor = (pad: PadTemplate): CopperLayer[] => (pad.through ? THT : SMD);

const header2 = (a: string, aRole: string, b: string, bRole: string): PadTemplate[] => [
  { number: a, dx: 0, dy: -1.27, w: 1.7, h: 1.7, through: true, role: aRole },
  { number: b, dx: 0, dy: 1.27, w: 1.7, h: 1.7, through: true, role: bRole },
];

const chip1206 = (a: string, aRole: string, b: string, bRole: string): PadTemplate[] => [
  { number: a, dx: -1.5, dy: 0, w: 1.2, h: 1.8, through: false, role: aRole },
  { number: b, dx: 1.5, dy: 0, w: 1.2, h: 1.8, through: false, role: bRole },
];

/** An 8-pin MCU module on 2.54 mm pins: power on the left, I/O on the right. */
const MCU_PINS: { pad: string; side: -1 | 1; row: number; role: string }[] = [
  { pad: "VCC", side: -1, row: 0, role: "5 V supply in" },
  { pad: "GND", side: -1, row: 1, role: "ground" },
  { pad: "A0", side: -1, row: 2, role: "analog input A0" },
  { pad: "A1", side: -1, row: 3, role: "analog input A1" },
  { pad: "D8", side: 1, row: 0, role: "digital I/O D8" },
  { pad: "D9", side: 1, row: 1, role: "digital I/O D9 (PWM)" },
  { pad: "D10", side: 1, row: 2, role: "digital I/O D10 (PWM)" },
  { pad: "D13", side: 1, row: 3, role: "digital I/O D13" },
];

export const TEMPLATES: Record<TemplateKind, PartTemplate> = {
  vsource: {
    kind: "vsource",
    partKind: "vsource",
    label: "5 V supply",
    hint: "Powers the board. Wire + to VCC and − to ground.",
    refPrefix: "J",
    footprint: "Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical",
    body: { w: 2.54, h: 5.08, height: 8.5 },
    pads: header2("+", "positive terminal", "-", "negative terminal (ground)"),
    defaultModel: () => ({ type: "vsource", volts: 5, posPad: "+", negPad: "-" }),
    blurb: "Bench supply input. Its − terminal is the ground reference for the whole board.",
  },
  mcu: {
    kind: "mcu",
    partKind: "mcu",
    label: "Microcontroller",
    hint: "Runs your sketch. Needs VCC and GND wired.",
    refPrefix: "U",
    footprint: "Package_DIP:DIP-8_W7.62mm",
    body: { w: 6.4, h: 9.6, height: 3.3 },
    pads: MCU_PINS.map(({ pad, side, row, role }) => ({
      number: pad, dx: side * 3.81, dy: -3.81 + row * 2.54, w: 1.6, h: 1.6, through: true, role,
    })),
    defaultModel: () => ({
      type: "mcu",
      vcc: 5,
      vccPad: "VCC",
      gndPad: "GND",
      adcBits: 10,
      pins: [
        { name: "D8", pad: "D8", capabilities: ["digital"], outputOhms: 25 },
        { name: "D9", pad: "D9", capabilities: ["digital", "pwm"], outputOhms: 25 },
        { name: "D10", pad: "D10", capabilities: ["digital", "pwm"], outputOhms: 25 },
        { name: "D13", pad: "D13", capabilities: ["digital"], outputOhms: 25 },
        { name: "A0", pad: "A0", capabilities: ["analog_in", "digital"], outputOhms: 25 },
        { name: "A1", pad: "A1", capabilities: ["analog_in", "digital"], outputOhms: 25 },
      ],
    }),
    blurb: "8-pin 5 V microcontroller module. Digital pins source about 25 Ω; A0 and A1 read 0–5 V as 0–1023.",
  },
  resistor: {
    kind: "resistor",
    partKind: "resistor",
    label: "Resistor",
    hint: "Limits current. 330 Ω suits an LED on 5 V.",
    refPrefix: "R",
    footprint: "Resistor_SMD:R_1206_3216Metric",
    body: { w: 3.2, h: 1.6, height: 0.55 },
    pads: chip1206("1", "terminal 1", "2", "terminal 2"),
    defaultModel: () => ({ type: "resistor", ohms: 330 }),
    blurb: "1206 thick-film resistor.",
  },
  led: {
    kind: "led",
    partKind: "led",
    label: "LED",
    hint: "Lights when current flows anode → cathode. Needs a series resistor.",
    refPrefix: "D",
    footprint: "LED_SMD:LED_1206_3216Metric",
    body: { w: 3.2, h: 1.6, height: 0.8 },
    pads: chip1206("A", "anode (+)", "K", "cathode (−)"),
    defaultModel: () => ({ type: "led", vf: 2, rOn: 10, anodePad: "A", cathodePad: "K", color: "red" }),
    blurb: "Red 1206 LED, about 2.0 V forward drop, rated 20 mA.",
  },
  capacitor: {
    kind: "capacitor",
    partKind: "capacitor",
    label: "Capacitor",
    hint: "Decouples a supply. Open circuit at DC.",
    refPrefix: "C",
    footprint: "Capacitor_SMD:C_1206_3216Metric",
    body: { w: 3.2, h: 1.6, height: 1.0 },
    pads: chip1206("1", "terminal 1", "2", "terminal 2"),
    defaultModel: () => ({ type: "capacitor", farads: 100e-9 }),
    blurb: "100 nF ceramic decoupling capacitor. Carries no current at DC.",
  },
  npn: {
    kind: "npn",
    partKind: "npn",
    label: "NPN transistor",
    hint: "A switch: base current lets collector current flow to emitter.",
    refPrefix: "Q",
    footprint: "Package_TO_SOT_SMD:SOT-23",
    body: { w: 2.9, h: 1.3, height: 1.0 },
    pads: [
      { number: "B", dx: -0.95, dy: 1.1, w: 0.9, h: 0.8, through: false, role: "base" },
      { number: "E", dx: 0.95, dy: 1.1, w: 0.9, h: 0.8, through: false, role: "emitter" },
      { number: "C", dx: 0, dy: -1.1, w: 0.9, h: 0.8, through: false, role: "collector" },
    ],
    defaultModel: () => ({ type: "npn", beta: 100, vbe: 0.7, vceSat: 0.2, basePad: "B", collectorPad: "C", emitterPad: "E" }),
    blurb: "2N3904-class NPN in SOT-23.",
  },
  potentiometer: {
    kind: "potentiometer",
    partKind: "potentiometer",
    label: "Potentiometer",
    hint: "A voltage divider you can turn. Wiper to an analog pin.",
    refPrefix: "RV",
    footprint: "Potentiometer_THT:Potentiometer_Bourns_3386P_Vertical",
    body: { w: 6, h: 4, height: 5 },
    pads: [
      { number: "1", dx: -2.5, dy: 0, w: 1.4, h: 1.4, through: true, role: "end A" },
      { number: "2", dx: 0, dy: -1.5, w: 1.4, h: 1.4, through: true, role: "wiper" },
      { number: "3", dx: 2.5, dy: 0, w: 1.4, h: 1.4, through: true, role: "end B" },
    ],
    defaultModel: () => ({ type: "potentiometer", ohms: 10_000, wiper: 0.5, endA: "1", endB: "3", wiperPad: "2" }),
    blurb: "10 kΩ trimmer.",
  },
  servo: {
    kind: "servo",
    partKind: "servo",
    label: "Servo",
    hint: "An actuator load. Stall it to stress the supply.",
    refPrefix: "M",
    footprint: "Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical",
    body: { w: 2.54, h: 5.08, height: 8.5 },
    pads: header2("+", "servo power", "-", "servo ground"),
    defaultModel: () => ({ type: "servo", runOhms: 25, stallOhms: 3, stalled: false, posPad: "+", negPad: "-" }),
    blurb: "Hobby servo modelled as a 25 Ω running load that drops to 3 Ω when stalled.",
  },
};

export const PALETTE_ORDER: TemplateKind[] = [
  "vsource", "mcu", "resistor", "led", "npn", "capacitor", "potentiometer", "servo",
];

/** Human value label for a model, e.g. "330 Ω", "5 V", "red LED". */
export function valueLabel(model: ElectricalModel): string {
  switch (model.type) {
    case "resistor": return `${formatEngineering(model.ohms)} Ω`;
    case "potentiometer": return `${formatEngineering(model.ohms)} Ω`;
    case "capacitor": return `${formatEngineering(model.farads)}F`;
    case "vsource": return `${formatEngineering(model.volts)} V`;
    case "led": return model.color;
    case "diode": return "diode";
    case "npn": return `β ${model.beta}`;
    case "mcu": return "MCU";
    case "servo": return "servo";
  }
}
