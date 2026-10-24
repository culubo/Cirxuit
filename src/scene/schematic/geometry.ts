/**
 * Schematic geometry: where each symbol's pins are, and how schematic space
 * maps onto the board.
 *
 * Schematic space is millimetres with board axes (+x right, +y down). The pin
 * offsets below are the contract schematic authors draw against: a wire that
 * ends on a pin's position connects to that pin.
 */
import type { Board, Part, Vec2 } from "../../model/board-model";

export type SymbolKind =
  | "resistor" | "capacitor" | "diode" | "led" | "potentiometer"
  | "npn" | "vsource" | "servo" | "box";

export interface SymbolPin {
  pad: string;
  /** Offset from the symbol centre at rotation 0, schematic mm. */
  local: Vec2;
  /** Short label drawn next to the pin on box symbols. */
  label: string;
}

/** Pitch for box-symbol pins, and the box's half width. */
export const BOX_PITCH = 2.54;
export const BOX_HALF_W = 7.62;

export function symbolKind(part: Part): SymbolKind {
  switch (part.kind) {
    case "resistor": return "resistor";
    case "capacitor": return "capacitor";
    case "diode": return "diode";
    case "led": return "led";
    case "potentiometer": return "potentiometer";
    case "npn": return "npn";
    case "vsource": return "vsource";
    case "servo": return "servo";
    default: return "box";
  }
}

/** Pad numbers in the roles each symbol draws, read from the model when present. */
function roles(part: Part): Record<string, string | undefined> {
  const m = part.model;
  const first = part.pads[0]?.number;
  const second = part.pads[1]?.number;
  switch (m?.type) {
    case "led":
    case "diode": return { a: m.anodePad, b: m.cathodePad };
    case "potentiometer": return { a: m.endA, b: m.endB, w: m.wiperPad };
    case "npn": return { b: m.basePad, c: m.collectorPad, e: m.emitterPad };
    case "vsource":
    case "servo": return { pos: m.posPad, neg: m.negPad };
    default: return { first, second };
  }
}

function pin(pad: string | undefined, x: number, y: number, label = ""): SymbolPin[] {
  return pad === undefined ? [] : [{ pad, local: { x, y }, label }];
}

function boxPins(part: Part): SymbolPin[] {
  const pads = part.pads.map((p) => p.number);
  const left = Math.ceil(pads.length / 2);
  const out: SymbolPin[] = [];
  pads.forEach((pad, i) => {
    const onLeft = i < left;
    const k = onLeft ? left : pads.length - left;
    const row = onLeft ? i : i - left;
    out.push({ pad, local: { x: onLeft ? -BOX_HALF_W : BOX_HALF_W, y: (row - (k - 1) / 2) * BOX_PITCH }, label: pad });
  });
  return out;
}

/** Every pin of the part's symbol, at rotation 0. */
export function symbolPins(part: Part): SymbolPin[] {
  const r = roles(part);
  switch (symbolKind(part)) {
    case "resistor":
    case "capacitor": return [...pin(r["first"] ?? part.pads[0]?.number, -5, 0), ...pin(r["second"] ?? part.pads[1]?.number, 5, 0)];
    case "led":
    case "diode": return [...pin(r["a"] ?? part.pads[0]?.number, -5, 0, "A"), ...pin(r["b"] ?? part.pads[1]?.number, 5, 0, "K")];
    case "potentiometer": return [
      ...pin(r["a"] ?? part.pads[0]?.number, -5, 0),
      ...pin(r["b"] ?? part.pads[2]?.number, 5, 0),
      ...pin(r["w"] ?? part.pads[1]?.number, 0, -4),
    ];
    case "npn": return [
      ...pin(r["b"] ?? part.pads[0]?.number, -4, 0, "B"),
      ...pin(r["c"] ?? part.pads[1]?.number, 2, -5, "C"),
      ...pin(r["e"] ?? part.pads[2]?.number, 2, 5, "E"),
    ];
    case "vsource": return [...pin(r["pos"] ?? part.pads[0]?.number, 0, -5, "+"), ...pin(r["neg"] ?? part.pads[1]?.number, 0, 5, "−")];
    case "servo": return [...pin(r["pos"] ?? part.pads[0]?.number, -4, 0, "+"), ...pin(r["neg"] ?? part.pads[1]?.number, 4, 0, "−")];
    case "box": return boxPins(part);
  }
}

/** Half extents of the symbol's drawing at rotation 0, for textures and hit areas. */
export function symbolHalfExtent(part: Part): Vec2 {
  switch (symbolKind(part)) {
    case "box": {
      const rows = Math.ceil(part.pads.length / 2);
      return { x: BOX_HALF_W + 0.6, y: Math.max(2.4, ((rows - 1) / 2) * BOX_PITCH + 1.6) };
    }
    case "npn": return { x: 4.6, y: 5.6 };
    case "vsource": return { x: 3.2, y: 5.6 };
    case "potentiometer": return { x: 5.6, y: 4.6 };
    case "servo": return { x: 4.6, y: 3.2 };
    default: return { x: 5.6, y: 2.6 };
  }
}

/** Rotate a local offset by the symbol rotation (counter-clockwise on screen, like footprints). */
export function rotateLocal(local: Vec2, rotationDeg: number): Vec2 {
  const r = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  return { x: local.x * cos + local.y * sin, y: -local.x * sin + local.y * cos };
}

export interface SchematicFit {
  /** mm of board per mm of schematic. */
  scale: number;
  /** Board-space centre the schematic is centred on. */
  center: Vec2;
  /** Board outline bounds. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export const SCHEMATIC_MARGIN_MM = 5;

/** Uniform fit of the schematic inside the board outline with a 5 mm margin, centred. */
export function schematicFit(board: Board): SchematicFit | null {
  const sch = board.schematic;
  if (!sch || sch.size.w <= 0 || sch.size.h <= 0 || board.outline.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of board.outline) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const w = maxX - minX - 2 * SCHEMATIC_MARGIN_MM;
  const h = maxY - minY - 2 * SCHEMATIC_MARGIN_MM;
  if (w <= 0 || h <= 0) return null;
  const scale = Math.min(w / sch.size.w, h / sch.size.h);
  return { scale, center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, bounds: { minX, minY, maxX, maxY } };
}

/** Schematic-space point → board-space point. */
export function toBoardSpace(board: Board, fit: SchematicFit, p: Vec2): Vec2 {
  const size = board.schematic!.size;
  return {
    x: fit.center.x + (p.x - size.w / 2) * fit.scale,
    y: fit.center.y + (p.y - size.h / 2) * fit.scale,
  };
}

export interface PlacedPin extends SymbolPin {
  /** Pin position in schematic space after the symbol's rotation. */
  at: Vec2;
}

/** A symbol's pins placed in schematic space. */
export function placedPins(part: Part, position: Vec2, rotationDeg: number): PlacedPin[] {
  return symbolPins(part).map((p) => {
    const off = rotateLocal(p.local, rotationDeg);
    return { ...p, at: { x: position.x + off.x, y: position.y + off.y } };
  });
}

/** Longest value label drawn next to a schematic symbol. */
export const SYMBOL_VALUE_MAX = 12;

/**
 * Compact a part value for the schematic label so neighbouring symbols don't
 * collide: "servo (run 25 Ω / stall 3 Ω)" → "servo",
 * "battery internal resistance (0.3 Ω)" → "0.3 Ω", "50 Ω controller" → "50 Ω".
 */
export function shortValue(value: string | undefined, max = SYMBOL_VALUE_MAX): string {
  if (!value) return "";
  const v = value.trim();
  if (v.length <= max) return v;
  const paren = v.match(/\(([^)]*)\)/)?.[1]?.trim();
  const main = v.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  if (main && main.length <= max) return main;
  if (paren && paren.length <= max) return paren;
  const src = main || v;
  let out = "";
  for (const word of src.split(/\s+/)) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > max) break;
    out = next;
  }
  return out || `${src.slice(0, max - 1)}…`;
}
