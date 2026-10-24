/**
 * generate-assembly-board.ts — builds src/model/robot-controller-board.json, a
 * dense two-layer robot controller used by the assembly demo.
 *
 *   npx tsx scripts/generate-assembly-board.ts
 *
 * Every MCU fan-out is routed with a nested-row pattern (outermost target on the
 * row nearest the package) so same-layer traces never cross; long runs switch
 * to B.Cu through vias where they would cross F.Cu traffic.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Board, CopperLayer, ElectricalModel, FunctionBlock, McuPin, Net, Pad, Part, Track, Vec2, Via } from "../src/model/board-model";
import { placedPins } from "../src/scene/schematic/geometry";
import { validateBoard } from "./validate-board";

const W = 100, H = 70;
const CX = 50, CY = 35;                  // U1 centre
const LAND = 4.16, PITCH = 0.8;          // TQFP-32 7x7 land centre and pitch
const SIG = 0.25, PWR = 0.6, BUS = 1.0;  // track widths

const parts: Part[] = [];
const tracks: Track[] = [];
const vias: Via[] = [];
const P = (x: number, y: number): Vec2 => ({ x: +x.toFixed(3), y: +y.toFixed(3) });

function pad(number: string, netId: string | null, at: Vec2, w: number, h: number, tht = false): Pad {
  return { number, netId, position: at, sizeMm: { w, h }, layers: tht ? ["F.Cu", "B.Cu"] : ["F.Cu"] };
}
function track(netId: string, layer: CopperLayer, width: number, ...points: Vec2[]): void {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    if (a.x === b.x && a.y === b.y) continue;
    tracks.push({ netId, layer, start: a, end: b, widthMm: width });
  }
}
function via(netId: string, at: Vec2, small = true): void {
  vias.push({ netId, position: at, drillMm: small ? 0.3 : 0.4, diameterMm: small ? 0.6 : 0.8 });
}
function part(p: Omit<Part, "side"> & { side?: Part["side"] }): Part {
  const full: Part = { side: "top", ...p };
  parts.push(full);
  return full;
}

/** Vertical 0603/0805 two-terminal part centred at (x, y); pad "1" at the bottom (+y). */
function vChip(ref: string, kind: Part["kind"], value: string, footprint: string, x: number, y: number, n1: string, n2: string, span: number, model?: ElectricalModel, blurb?: string): Part {
  const size = footprint.includes("0805") ? 1.0 : 0.9;
  return part({
    ref, kind, value, footprint, position: P(x, y), rotationDeg: 90,
    body: { w: span, h: size * 1.3, height: 0.6 },
    pads: [pad("1", n1, P(x, y + span / 2), size, size), pad("2", n2, P(x, y - span / 2), size, size)],
    ...(model ? { model } : {}), ...(blurb ? { blurb } : {}),
  });
}

/** Board position of TQFP pin n (1..32), counter-clockwise from the top of the left side. */
function pin(n: number): Vec2 {
  const i = (n - 1) % 8, t = -2.8 + i * PITCH;
  switch (Math.floor((n - 1) / 8)) {
    case 0: return P(CX - LAND, CY + t);
    case 1: return P(CX + t, CY + LAND);
    case 2: return P(CX + LAND, CY - t);
    default: return P(CX - t, CY - LAND);
  }
}

/**
 * Nested fan-out. `from` points sit on a line; each goes `out` to its own row,
 * across to its target's column, then `out` again to the target. Pairs are
 * matched in order along the line, and the outermost pair on each side gets the
 * row nearest the start so no two paths cross on the same layer.
 */
function fanout(net: (i: number) => string, layer: CopperLayer, width: number, from: Vec2[], to: Vec2[], axis: "x" | "y", out: 1 | -1, firstRow: number, rowStep: number, neck?: { width: number; length: number }): void {
  const along = (p: Vec2) => (axis === "x" ? p.x : p.y);
  const order = from.map((p, i) => ({ p, i })).sort((a, b) => along(a.p) - along(b.p));
  const targets = [...to].sort((a, b) => along(a) - along(b));
  const pairs = order.map((o, k) => ({ ...o, t: targets[k]! }));
  const low = pairs.filter((q) => along(q.t) < along(q.p));        // target before the start
  const high = pairs.filter((q) => along(q.t) >= along(q.p)).reverse();
  for (const group of [low, high]) {
    group.forEach((q, rank) => {
      const row = firstRow + out * rank * rowStep;
      const pts = axis === "x"
        ? [q.p, P(q.p.x, row), P(q.t.x, row), q.t]
        : [q.p, P(row, q.p.y), P(row, q.t.y), q.t];
      if (neck) {
        // A thin escape out of the fine-pitch land before widening.
        const n = axis === "x" ? P(q.p.x, q.p.y + out * neck.length) : P(q.p.x + out * neck.length, q.p.y);
        track(net(q.i), layer, neck.width, q.p, n);
        track(net(q.i), layer, width, n, ...pts.slice(1));
      } else {
        track(net(q.i), layer, width, ...pts);
      }
    });
  }
}

// ── power entry ──────────────────────────────────────────────────────────────
part({
  ref: "J1", kind: "vsource", value: "5V", footprint: "Connector_AMASS:AMASS_XT30U-M_1x02_P5.0mm_Vertical",
  position: P(8, 35), rotationDeg: 0, body: { w: 5, h: 10, height: 8 },
  pads: [pad("+", "VIN", P(8, 32.5), 2.5, 2.5, true), pad("-", "GND", P(8, 37.5), 2.5, 2.5, true)],
  model: { type: "vsource", volts: 5, posPad: "+", negPad: "-" },
  blurb: "XT30 power entry from the robot's 5 V regulator. Servos take raw VIN; the logic side is fused.",
});
part({
  ref: "F1", kind: "resistor", value: "0.05 Ω fuse", footprint: "Fuse:Fuse_1812_4532Metric",
  position: P(18, 32.5), rotationDeg: 0, body: { w: 4.5, h: 3.2, height: 1.2 },
  pads: [pad("1", "VIN", P(16, 32.5), 1.8, 2.8), pad("2", "+5V", P(20, 32.5), 1.8, 2.8)],
  model: { type: "resistor", ohms: 0.05 }, blurb: "Resettable fuse protecting the logic rail from a shorted sensor lead.",
});
track("VIN", "F.Cu", BUS, P(8, 32.5), P(16, 32.5));
part({
  ref: "C1", kind: "capacitor", value: "220uF", footprint: "Capacitor_THT:CP_Radial_D8.0mm_P5.00mm",
  position: P(28, 35), rotationDeg: 90, body: { w: 8, h: 8, height: 10.5 },
  pads: [pad("1", "+5V", P(28, 32.5), 1.8, 1.8, true), pad("2", "GND", P(28, 37.5), 1.8, 1.8, true)],
  model: { type: "capacitor", farads: 220e-6 }, blurb: "Bulk reservoir for the logic rail.",
});
// Logic rails into U1 pins 4 (VCC) and 5 (GND), necked at the fine-pitch lands.
const vccPin = pin(4), gndPin = pin(5);
const capTaps = [28, 33, 35.5, 38];
track("+5V", "F.Cu", PWR, P(20, 32.5), ...capTaps.map((x) => P(x, 32.5)), P(41, 32.5), P(41, vccPin.y), P(43.5, vccPin.y));
track("+5V", "F.Cu", 0.3, P(43.5, vccPin.y), vccPin);
track("GND", "F.Cu", PWR, P(8, 37.5), ...capTaps.map((x) => P(x, 37.5)), P(40, 37.5), P(40, gndPin.y), P(43.5, gndPin.y));
track("GND", "F.Cu", 0.3, P(43.5, gndPin.y), gndPin);
// Decoupling bridging the rails, close to the package.
["C2", "C3", "C4"].forEach((ref, i) => {
  const x = 33 + i * 2.5;
  vChip(ref, "capacitor", "100nF", "Capacitor_SMD:C_0603_1608Metric", x, 35, "GND", "+5V", 1.6,
    { type: "capacitor", farads: 100e-9 }, "Local decoupling for U1's supply pins.");
  track("+5V", "F.Cu", PWR, P(x, 32.5), P(x, 34.2));
  track("GND", "F.Cu", PWR, P(x, 37.5), P(x, 35.8));
});

// ── MCU ──────────────────────────────────────────────────────────────────────
const mcuPins: McuPin[] = [];
const mcuPads: Pad[] = [pad("4", "+5V", vccPin, 1.475, 0.55), pad("5", "GND", gndPin, 1.475, 0.55)];
const land = (n: number, net: string) => {
  const side = Math.floor((n - 1) / 8);
  const horizontal = side === 0 || side === 2;
  mcuPads.push(pad(String(n), net, pin(n), horizontal ? 1.475 : 0.55, horizontal ? 0.55 : 1.475));
};

// ── LED bank: top pins 25..32 → R → LED → GND ───────────────────────────────
const ledColors = ["red", "amber", "yellow", "green", "green", "blue", "blue", "white"];
const ledX = Array.from({ length: 8 }, (_, k) => 12 + k * 9.5);
const topPins = Array.from({ length: 8 }, (_, k) => 25 + k);           // x descending
const topSorted = [...topPins].sort((a, b) => pin(a).x - pin(b).x);
topSorted.forEach((n, k) => {
  const name = `D${2 + k}`;
  land(n, name);
  mcuPins.push({ name, pad: String(n), capabilities: ["digital", "pwm"], outputOhms: 25 });
  const x = ledX[k]!;
  vChip(`R${10 + k}`, "resistor", "330", "Resistor_SMD:R_0603_1608Metric", x, 16, name, `LED${k}`, 1.6,
    { type: "resistor", ohms: 330 }, `Current limit for LED ${k}.`);
  part({
    ref: `D${10 + k}`, kind: "led", value: ledColors[k]!, footprint: "LED_SMD:LED_0805_2012Metric",
    position: P(x, 11), rotationDeg: 90, body: { w: 2.4, h: 1.4, height: 1.1 },
    pads: [pad("A", `LED${k}`, P(x, 12), 1.0, 1.0), pad("K", "GND", P(x, 10), 1.0, 1.0)],
    model: { type: "led", vf: ledColors[k] === "blue" || ledColors[k] === "white" ? 3.0 : 2.0, rOn: 10, anodePad: "A", cathodePad: "K", color: ledColors[k]! },
    blurb: `Status LED ${k}, driven straight from ${name}.`,
  });
  track(`LED${k}`, "F.Cu", SIG, P(x, 15.2), P(x, 12));
  track("GND", "F.Cu", SIG, P(x, 10), P(x, 7));
  via("GND", P(x, 7));
  track("GND", "B.Cu", PWR, P(x, 7), P(x, 3));
});
fanout((i) => `D${2 + i}`, "F.Cu", SIG, topSorted.map(pin), ledX.map((x) => P(x, 16.8)), "x", -1, 29.4, 0.9, { width: SIG, length: 1.2 });
// GND return bus on B.Cu along the top edge, fed from J1 round the left side.
track("GND", "B.Cu", BUS, P(8, 37.5), P(4.5, 37.5), P(4.5, 3), ...ledX.map((x) => P(x, 3)), P(91.08, 3));

// ── servo outputs: right pins 17..24 → B.Cu fan-out → 3-pin headers ─────────
const servoY = Array.from({ length: 8 }, (_, k) => 8 + k * 7);
const rightPins = Array.from({ length: 8 }, (_, k) => 17 + k);
const rightSorted = [...rightPins].sort((a, b) => pin(a).y - pin(b).y);
const escapes: Vec2[] = [];
rightSorted.forEach((n, k) => {
  const name = `S${k}`;
  land(n, name);
  mcuPins.push({ name, pad: String(n), capabilities: ["digital", "pwm"], outputOhms: 25 });
  const p = pin(n);
  // Stagger the escape vias so neighbours at 0.8 mm pitch keep clearance.
  const e = P(p.x + (k % 2 === 0 ? 1.7 : 2.9), p.y);
  track(name, "F.Cu", SIG, p, e);
  via(name, e);
  escapes.push(e);
  part({
    ref: `J${10 + k}`, kind: "connector", value: "servo", footprint: "Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Vertical",
    position: P(88.54, servoY[k]!), rotationDeg: 0, body: { w: 7.62, h: 2.54, height: 8.5 },
    pads: [
      pad("1", name, P(86, servoY[k]!), 1.7, 1.7, true),
      pad("2", "VIN", P(88.54, servoY[k]!), 1.7, 1.7, true),
      pad("3", "GND", P(91.08, servoY[k]!), 1.7, 1.7, true),
    ],
    blurb: `Servo ${k} plug: PWM signal from ${name}, raw VIN, ground.`,
  });
});
fanout((i) => `S${i}`, "B.Cu", SIG, escapes, servoY.map((y) => P(86, y)), "y", 1, 60, 0.9);
track("VIN", "B.Cu", BUS, ...servoY.map((y) => P(88.54, y)), P(88.54, 66), P(13, 66), P(13, 32.5), P(8, 32.5));
track("GND", "B.Cu", BUS, P(91.08, 3), ...servoY.map((y) => P(91.08, y)));

// ── sensor inputs: bottom pins 9..16 → series R → 1x08 header ───────────────
const sensX = Array.from({ length: 8 }, (_, k) => 32.5 + k * 5);
const hdrX = Array.from({ length: 8 }, (_, k) => 50 + (k - 3.5) * 2.54);
const botPins = Array.from({ length: 8 }, (_, k) => 9 + k);
botPins.forEach((n, k) => {
  const name = k < 6 ? `A${k}` : `D${10 + k}`;
  land(n, name);
  mcuPins.push({ name, pad: String(n), capabilities: k < 6 ? ["digital", "analog_in"] : ["digital"], outputOhms: 25 });
  vChip(`R${20 + k}`, "resistor", "1k", "Resistor_SMD:R_0603_1608Metric", sensX[k]!, 50, `IN${k}`, name, 1.6,
    { type: "resistor", ohms: 1000 }, `Series protection for sensor input ${name}.`);
});
fanout((i) => (i < 6 ? `A${i}` : `D${10 + i}`), "F.Cu", SIG, botPins.map(pin), sensX.map((x) => P(x, 49.2)), "x", 1, 40.6, 0.9, { width: SIG, length: 1.0 });
fanout((i) => `IN${i}`, "F.Cu", SIG, sensX.map((x) => P(x, 50.8)), hdrX.map((x) => P(x, 62)), "x", 1, 52.5, 0.8);
part({
  ref: "J20", kind: "connector", value: "sensors", footprint: "Connector_PinHeader_2.54mm:PinHeader_1x08_P2.54mm_Vertical",
  position: P(50, 62), rotationDeg: 0, body: { w: 20.32, h: 2.54, height: 8.5 },
  // Pad order sets the schematic box: IN3..IN0 down the left side, IN4..IN7 down the right.
  pads: [3, 2, 1, 0, 4, 5, 6, 7].map((k) => pad(String(k + 1), `IN${k}`, P(hdrX[k]!, 62), 1.7, 1.7, true)),
  blurb: "Eight sensor inputs: six analog, two digital.",
});

// Schematic box order: power, LEDs, A0..A2 down the left; servos, A3..D17 down the right.
const mcuOrder = ["+5V", "GND", ...Array.from({ length: 8 }, (_, k) => `D${2 + k}`), "A0", "A1", "A2",
  ...Array.from({ length: 8 }, (_, k) => `S${k}`), "A3", "A4", "A5", "D16", "D17"];
mcuPads.sort((a, b) => mcuOrder.indexOf(a.netId ?? "") - mcuOrder.indexOf(b.netId ?? ""));
part({
  ref: "U1", kind: "mcu", value: "ATmega328P", footprint: "Package_QFP:TQFP-32_7x7mm_P0.8mm",
  position: P(CX, CY), rotationDeg: 0, body: { w: 7, h: 7, height: 1.2 },
  pads: mcuPads,
  model: { type: "mcu", vcc: 5, gndPad: "5", vccPad: "4", pins: mcuPins, adcBits: 10 },
  blurb: "The robot's controller: eight status LEDs, eight servo PWM outputs, eight sensor inputs.",
});

// ── nets, blocks, board ──────────────────────────────────────────────────────
const netMap = new Map<string, Net>();
for (const p of parts) for (const d of p.pads) {
  if (!d.netId) continue;
  const net = netMap.get(d.netId) ?? { id: d.netId, name: d.netId, pads: [] };
  net.pads.push({ ref: p.ref, pad: d.number });
  netMap.set(d.netId, net);
}
const refs = (re: RegExp) => parts.map((p) => p.ref).filter((r) => re.test(r));
const blocks: FunctionBlock[] = [
  { id: "power", label: "Power entry", description: "XT30 input, fuse, bulk and decoupling capacitors.", partRefs: ["J1", "F1", "C1", "C2", "C3", "C4"], color: "accent-power" },
  { id: "mcu", label: "Controller", description: "ATmega328P running the robot firmware.", partRefs: ["U1"], color: "accent-mcu" },
  { id: "leds", label: "Status LEDs", description: "Eight LEDs with series resistors.", partRefs: refs(/^(R1\d|D1\d)$/), color: "accent-driver" },
  { id: "servos", label: "Servo outputs", description: "Eight 3-pin servo plugs.", partRefs: refs(/^J1\d$/), color: "accent-warn" },
  { id: "sensors", label: "Sensor inputs", description: "Series-protected inputs to an 8-pin header.", partRefs: [...refs(/^R2\d$/), "J20"], color: "accent-sensor" },
];
// ── schematic ────────────────────────────────────────────────────────────────
// Drawn in its own millimetre space (x right, y down). Every wire ends on a pin
// (from the same symbol geometry the overlay draws) or on another wire of its net.
const symbols: NonNullable<Board["schematic"]>["symbols"] = [];
const wires: NonNullable<Board["schematic"]>["wires"] = [];
const pinAt = new Map<string, Vec2>();
function sym(ref: string, x: number, y: number, rotationDeg = 0): void {
  const p = parts.find((q) => q.ref === ref);
  if (!p) throw new Error(`schematic: no part ${ref}`);
  symbols.push({ ref, position: P(x, y), rotationDeg });
  for (const pin of placedPins(p, { x, y }, rotationDeg)) pinAt.set(`${ref}.${pin.pad}`, P(pin.at.x, pin.at.y));
}
function pinOf(ref: string, pad: string): Vec2 {
  const at = pinAt.get(`${ref}.${pad}`);
  if (!at) throw new Error(`schematic: no pin ${ref}.${pad}`);
  return at;
}
function padOfNet(ref: string, net: string): string {
  const pad = parts.find((q) => q.ref === ref)?.pads.find((d) => d.netId === net)?.number;
  if (!pad) throw new Error(`schematic: ${ref} has no pad on ${net}`);
  return pad;
}
function wire(netId: string, ...points: Vec2[]): void {
  wires.push({ netId, points: points.map((q) => P(q.x, q.y)) });
}

// Power: XT30, fuse, +5V rail (y 25) and GND rail (y 55) with the capacitors between.
sym("J1", 20, 40);
sym("F1", 40, 25);
sym("C1", 60, 40, 270);
["C2", "C3", "C4"].forEach((ref, i) => sym(ref, 70 + i * 10, 40, 90));
const u1 = { x: 130, y: 85 };
sym("U1", u1.x, u1.y);
const vcc = pinOf("U1", padOfNet("U1", "+5V")), gnd = pinOf("U1", padOfNet("U1", "GND"));
wire("VIN", pinOf("J1", "+"), P(20, 25), pinOf("F1", "1"));
wire("+5V", pinOf("F1", "2"), P(121, 25), P(121, vcc.y), vcc);
wire("GND", pinOf("J1", "-"), P(20, 55), P(120, 55), P(120, gnd.y), gnd);
for (const ref of ["C1", "C2", "C3", "C4"]) {
  const top = pinOf(ref, padOfNet(ref, "+5V")), bottom = pinOf(ref, padOfNet(ref, "GND"));
  wire("+5V", top, P(top.x, 25));
  wire("GND", bottom, P(bottom.x, 55));
}

// LED bank, left: MCU pin → 330 Ω → LED → GND bus at x 55.
const GND_BUS_X = 55, BOTTOM_Y = 170;
for (let k = 0; k < 8; k++) {
  const name = `D${2 + k}`, y = 68 + k * 12, lane = 103 + k * 2;
  const r = `R${10 + k}`, d = `D${10 + k}`;
  sym(r, 95, y, 180);
  sym(d, 75, y, 180);
  const mcu = pinOf("U1", padOfNet("U1", name));
  wire(name, mcu, P(lane, mcu.y), P(lane, y), pinOf(r, "1"));
  wire(`LED${k}`, pinOf(r, "2"), pinOf(d, "A"));
  wire("GND", pinOf(d, "K"), P(GND_BUS_X, y));
}
wire("GND", P(GND_BUS_X, 55), P(GND_BUS_X, BOTTOM_Y));

// Servo plugs, right column: signal from the MCU, VIN bus at x 228, GND bus at x 250.
const VIN_BUS_X = 268, SERVO_GND_X = 290, VIN_TOP = 8;
const servoRows = Array.from({ length: 8 }, (_, k) => 15 + k * 11);
servoRows.forEach((y, k) => sym(`J${10 + k}`, 280, y));
servoRows.forEach((y, k) => {
  const name = `S${k}`;
  const mcu = pinOf("U1", padOfNet("U1", name));
  const sig = pinOf(`J${10 + k}`, "1");
  const lane = sig.y < mcu.y ? 150 + k * 2 : 150; // upward runs nest outward; the one downward run reuses the inner lane below them
  wire(name, mcu, P(lane, mcu.y), P(lane, sig.y), sig);
  const vin = pinOf(`J${10 + k}`, "2");
  wire("VIN", vin, P(VIN_BUS_X, vin.y));
  const g = pinOf(`J${10 + k}`, "3");
  wire("GND", g, P(SERVO_GND_X, g.y));
});
wire("VIN", P(20, 25), P(20, VIN_TOP), P(VIN_BUS_X, VIN_TOP), P(VIN_BUS_X, pinOf("J17", "2").y));
wire("GND", P(SERVO_GND_X, pinOf("J10", "3").y), P(SERVO_GND_X, BOTTOM_Y), P(GND_BUS_X, BOTTOM_Y));

// Sensor inputs, bottom: MCU pin → 1 kΩ (vertical) → 8-pin header.
const sensorX = [130, 146, 162, 178, 222, 238, 254, 270];
sym("J20", 205, 152);
for (let k = 0; k < 8; k++) {
  const name = k < 6 ? `A${k}` : `D${10 + k}`;
  const r = `R${20 + k}`;
  sym(r, sensorX[k]!, 125, 90);
  const mcu = pinOf("U1", padOfNet("U1", name));
  const leftSide = mcu.x < u1.x;
  const lane = leftSide ? 120.5 - k * 1.2 : 139.5 + (k - 3) * 1.2;
  const row = 104 + k * 1.8;
  const top = pinOf(r, "2");
  wire(name, mcu, P(lane, mcu.y), P(lane, row), P(top.x, row), top);
  const bottom = pinOf(r, "1");
  const hdr = pinOf("J20", String(k + 1));
  wire(`IN${k}`, bottom, P(bottom.x, hdr.y), hdr);
}

// Every part has a symbol, and every pin with a net is reached by a wire of that net.
for (const p of parts) {
  if (!symbols.some((s) => s.ref === p.ref)) throw new Error(`schematic: ${p.ref} has no symbol`);
  for (const d of p.pads) {
    if (!d.netId) continue;
    const at = pinOf(p.ref, d.number);
    const reached = wires.some((w) => w.netId === d.netId && w.points.some((q) => Math.hypot(q.x - at.x, q.y - at.y) < 1e-6));
    if (!reached) throw new Error(`schematic: ${p.ref}.${d.number} (${d.netId}) is not wired`);
  }
}

const board: Board = {
  id: "robot-controller-board",
  name: "Robot Controller r2",
  outline: [P(0, 0), P(W, 0), P(W, H), P(0, H)],
  thicknessMm: 1.6,
  copperLayers: ["F.Cu", "B.Cu"],
  parts, nets: [...netMap.values()], tracks, vias, blocks,
  groundNetId: "GND",
  schematic: { size: { w: 300, h: 180 }, symbols, wires },
};

const violations = validateBoard(board);
if (violations.length) {
  for (const v of violations) process.stderr.write(`- ${v}\n`);
  process.exitCode = 1;
}
const out = resolve(process.cwd(), "src/model/robot-controller-board.json");
writeFileSync(out, JSON.stringify(board, null, 2) + "\n");
process.stdout.write(`${parts.length} parts, ${tracks.length} tracks, ${vias.length} vias → ${out}\n`);
