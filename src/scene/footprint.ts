/**
 * footprint.ts — pure package knowledge shared by the board artwork and the 3D
 * part models: which physical package a part is, its real dimensions, and the
 * full land pattern (the board data only lists the pads that carry a net, so a
 * TQFP-32 arrives with four pads; the fab artwork needs all 32).
 *
 * Board space throughout: mm, origin top-left, +x right, +y down.
 */
import type { Pad, Part, Vec2 } from "../model/board-model";

export type PackageFamily =
  | "chip-resistor"
  | "chip-capacitor"
  | "chip-fuse"
  | "chip-led"
  | "sot23"
  | "qfp"
  | "pin-header"
  | "trimpot"
  | "radial-cap"
  | "xt30"
  | "generic";

/** Classify a part by its footprint string, falling back to its kind. */
export function packageFamily(part: Part): PackageFamily {
  const fp = part.footprint;
  if (/^Fuse:/i.test(fp)) return "chip-fuse";
  if (/LED_SMD/i.test(fp)) return "chip-led";
  if (/Resistor_SMD/i.test(fp)) return "chip-resistor";
  if (/Capacitor_SMD/i.test(fp)) return "chip-capacitor";
  if (/CP_Radial/i.test(fp)) return "radial-cap";
  if (/SOT-23/i.test(fp)) return "sot23";
  if (/QFP/i.test(fp)) return "qfp";
  if (/PinHeader/i.test(fp)) return "pin-header";
  if (/Potentiometer/i.test(fp)) return "trimpot";
  if (/XT30/i.test(fp)) return "xt30";
  return "generic";
}

export interface ChipSize {
  length: number;   // along the terminal axis
  width: number;
  height: number;
  terminal: number; // end-cap length
}

/** Real EIA chip dimensions from the KiCad metric code, e.g. "_1608Metric". */
export function chipSize(part: Part): ChipSize {
  const family = packageFamily(part);
  const code = /_(\d{2})(\d{2})Metric/.exec(part.footprint);
  const length = code ? Number(code[1]) / 10 : part.body.w;
  const rawWidth = code ? Number(code[2]) / 10 : part.body.h;
  // Metric codes truncate: 2012 is 2.0 x 1.25 mm, 3216 is 3.2 x 1.6 mm.
  const width = rawWidth === 1.2 ? 1.25 : rawWidth;
  const terminal = Math.min(0.5, length * 0.2);
  switch (family) {
    case "chip-capacitor": return { length, width, height: Math.min(1.25, width), terminal };
    case "chip-led": return { length, width, height: 0.8, terminal: 0.35 };
    case "chip-fuse": return { length, width, height: Math.min(part.body.height, 1.2), terminal: 0.6 };
    default: return { length, width, height: length >= 3 ? 0.55 : length >= 2 ? 0.5 : 0.45, terminal };
  }
}

// ─── QFP land pattern ────────────────────────────────────────────────────────

export interface QfpGeometry {
  pinsPerSide: number;
  pitch: number;
  body: number;      // square body edge
  landCenter: number; // distance from centre to land centre
  land: { long: number; short: number };
}

/** Geometry for the QFP named by the footprint, e.g. "TQFP-32_7x7mm_P0.8mm". */
export function qfpGeometry(part: Part): QfpGeometry {
  const pins = Number(/QFP-(\d+)/i.exec(part.footprint)?.[1] ?? 32);
  const body = Number(/_(\d+(?:\.\d+)?)x\d+(?:\.\d+)?mm/i.exec(part.footprint)?.[1] ?? 7);
  const pitch = Number(/_P(\d+(?:\.\d+)?)mm/i.exec(part.footprint)?.[1] ?? 0.8);
  // IPC nominal for 1.0 mm leads: land centre 0.66 mm outside the body edge.
  return { pinsPerSide: pins / 4, pitch, body, landCenter: body / 2 + 0.66, land: { long: 1.475, short: 0.55 } };
}

export interface QfpPin {
  number: number;
  /** Package-local position, board orientation (+y down), before rotation. */
  local: Vec2;
  /** Unit vector pointing out of the body through this pin. */
  outward: Vec2;
}

/** All QFP pins, numbered counter-clockwise from pin 1 at the top of the left side. */
export function qfpPins(geom: QfpGeometry): QfpPin[] {
  const pins: QfpPin[] = [];
  const n = geom.pinsPerSide;
  const span = (n - 1) * geom.pitch;
  const c = geom.landCenter;
  for (let i = 0; i < n; i++) {
    const t = -span / 2 + i * geom.pitch;
    pins.push({ number: 1 + i, local: { x: -c, y: t }, outward: { x: -1, y: 0 } });
    pins.push({ number: 1 + n + i, local: { x: t, y: c }, outward: { x: 0, y: 1 } });
    pins.push({ number: 1 + 2 * n + i, local: { x: c, y: -t }, outward: { x: 1, y: 0 } });
    pins.push({ number: 1 + 3 * n + i, local: { x: -t, y: -c }, outward: { x: 0, y: -1 } });
  }
  return pins.sort((a, b) => a.number - b.number);
}

/** Rotate a package-local offset (board orientation) by the part rotation. */
export function toBoard(part: Part, local: Vec2): Vec2 {
  // KiCad rotation is counter-clockwise as seen from the top, with +y down.
  const r = (part.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  return {
    x: part.position.x + local.x * cos + local.y * sin,
    y: part.position.y - local.x * sin + local.y * cos,
  };
}

/** Inverse of toBoard: board-space point to package-local offset. */
export function toLocal(part: Part, point: Vec2): Vec2 {
  const r = (part.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  const dx = point.x - part.position.x, dy = point.y - part.position.y;
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

/**
 * The complete copper land pattern for a part: every pad in the board data plus
 * the unconnected lands a real package has (netId null). Only QFPs need filling
 * in; every other family is already complete in the data.
 */
export function landPattern(part: Part): Pad[] {
  if (packageFamily(part) !== "qfp") return part.pads;
  const geom = qfpGeometry(part);
  const layers = part.pads[0]?.layers ?? ["F.Cu"];
  const lands: Pad[] = [...part.pads];
  for (const pin of qfpPins(geom)) {
    const at = toBoard(part, pin.local);
    if (part.pads.some((p) => Math.hypot(p.position.x - at.x, p.position.y - at.y) < geom.pitch / 2)) continue;
    const r = Math.abs(part.rotationDeg % 180) === 90;
    const horizontal = (pin.outward.x !== 0) !== r;
    lands.push({
      number: String(pin.number),
      netId: null,
      position: at,
      sizeMm: horizontal ? { w: geom.land.long, h: geom.land.short } : { w: geom.land.short, h: geom.land.long },
      layers,
    });
  }
  return lands;
}

/** Through-hole pads sit on both outer layers and get a drilled hole. */
export function isThroughHole(pad: Pad): boolean {
  return pad.layers.includes("F.Cu") && pad.layers.includes("B.Cu");
}

/** Plausible finished-hole size for a through-hole pad. */
export function drillFor(pad: Pad): number {
  return Math.min(pad.sizeMm.w, pad.sizeMm.h) * 0.58;
}

// ─── markings ────────────────────────────────────────────────────────────────

/** EIA 3-digit resistor code: 1k → "102", 220 → "221", 0.3 → "R30". */
export function resistorCode(ohms: number): string {
  if (!Number.isFinite(ohms) || ohms <= 0) return "";
  if (ohms < 1) return `R${ohms.toFixed(2).slice(2)}`;
  if (ohms < 10) return ohms.toFixed(1).replace(".", "R");
  const exponent = Math.floor(Math.log10(ohms)) - 1;
  const digits = Math.round(ohms / 10 ** exponent);
  if (digits >= 100) return `${String(digits).slice(0, 2)}${exponent + 1}`;
  return `${digits}${exponent}`;
}

/** True when a part value reads like a manufacturer part number worth lasering on. */
export function isPartNumber(value: string): boolean {
  return /^[A-Za-z]{2,}[A-Za-z0-9-]*\d[A-Za-z0-9-]*$/.test(value.trim());
}
