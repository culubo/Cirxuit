/**
 * The PCB builder's document: parts placed on a board and wires between pads.
 * `docToBoard` turns it into a normal Board — nets from wires, traces routed
 * along the wires — so the solver, runtime, and 3D scene treat a user board
 * exactly like a built-in one.
 *
 * Every edit helper here is pure: it returns a new document.
 */
import type { Board, ElectricalModel, Net, Pad, Part, Track, Vec2 } from "../model/board-model";
import { layersFor, TEMPLATES, valueLabel, type TemplateKind } from "./templates";

export const CUSTOM_BOARD_ID = "custom-board";
export const GRID_MM = 1.27;

export type Rotation = 0 | 90 | 180 | 270;

export interface PlacedPart {
  ref: string;
  kind: TemplateKind;
  x: number;
  y: number;
  rotation: Rotation;
  model: ElectricalModel;
}

export interface PadRef {
  ref: string;
  pad: string;
}

export interface Wire {
  id: string;
  a: PadRef;
  b: PadRef;
}

export interface BuilderDoc {
  name: string;
  widthMm: number;
  heightMm: number;
  parts: PlacedPart[];
  wires: Wire[];
}

export const TRACE_WIDTH_MM = 0.5;

export function blankDoc(): BuilderDoc {
  return { name: "My board", widthMm: 60, heightMm: 40, parts: [], wires: [] };
}

export const snap = (mm: number): number => Math.round(mm / GRID_MM) * GRID_MM;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Rotate a package-local offset clockwise on screen (board space, +y down). */
export function rotateOffset(dx: number, dy: number, rotation: Rotation): Vec2 {
  switch (rotation) {
    case 0: return { x: dx, y: dy };
    case 90: return { x: -dy, y: dx };
    case 180: return { x: -dx, y: -dy };
    case 270: return { x: dy, y: -dx };
  }
}

/** Absolute pad positions for a placed part. */
export function placedPads(part: PlacedPart): { number: string; at: Vec2; w: number; h: number; through: boolean; role: string }[] {
  const tpl = TEMPLATES[part.kind];
  const quarter = part.rotation === 90 || part.rotation === 270;
  return tpl.pads.map((pad) => {
    const off = rotateOffset(pad.dx, pad.dy, part.rotation);
    return {
      number: pad.number,
      at: { x: part.x + off.x, y: part.y + off.y },
      w: quarter ? pad.h : pad.w,
      h: quarter ? pad.w : pad.h,
      through: pad.through,
      role: pad.role,
    };
  });
}

export function padPosition(doc: BuilderDoc, ref: PadRef): Vec2 | null {
  const part = doc.parts.find((p) => p.ref === ref.ref);
  if (!part) return null;
  return placedPads(part).find((p) => p.number === ref.pad)?.at ?? null;
}

/** Manhattan route for a wire: straight, or horizontal then vertical. */
export function wireRoute(a: Vec2, b: Vec2): Vec2[] {
  if (Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6) return [a, b];
  return [a, { x: b.x, y: a.y }, b];
}

// ─── edits ───────────────────────────────────────────────────────────────────

function nextRef(doc: BuilderDoc, prefix: string): string {
  let n = 1;
  const used = new Set(doc.parts.map((p) => p.ref));
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

export function addPart(doc: BuilderDoc, kind: TemplateKind, x: number, y: number): { doc: BuilderDoc; ref: string } {
  const tpl = TEMPLATES[kind];
  const ref = nextRef(doc, tpl.refPrefix);
  const part: PlacedPart = {
    ref,
    kind,
    x: clamp(snap(x), 0, doc.widthMm),
    y: clamp(snap(y), 0, doc.heightMm),
    rotation: 0,
    model: tpl.defaultModel(),
  };
  return { doc: { ...doc, parts: [...doc.parts, part] }, ref };
}

export function movePart(doc: BuilderDoc, ref: string, x: number, y: number): BuilderDoc {
  return {
    ...doc,
    parts: doc.parts.map((p) =>
      p.ref === ref ? { ...p, x: clamp(snap(x), 0, doc.widthMm), y: clamp(snap(y), 0, doc.heightMm) } : p,
    ),
  };
}

export function rotatePart(doc: BuilderDoc, ref: string): BuilderDoc {
  return {
    ...doc,
    parts: doc.parts.map((p) => (p.ref === ref ? { ...p, rotation: ((p.rotation + 90) % 360) as Rotation } : p)),
  };
}

export function deletePart(doc: BuilderDoc, ref: string): BuilderDoc {
  return {
    ...doc,
    parts: doc.parts.filter((p) => p.ref !== ref),
    wires: doc.wires.filter((w) => w.a.ref !== ref && w.b.ref !== ref),
  };
}

export function setPartModel(doc: BuilderDoc, ref: string, model: ElectricalModel): BuilderDoc {
  return { ...doc, parts: doc.parts.map((p) => (p.ref === ref ? { ...p, model } : p)) };
}

const samePad = (x: PadRef, y: PadRef): boolean => x.ref === y.ref && x.pad === y.pad;

export function addWire(doc: BuilderDoc, a: PadRef, b: PadRef): BuilderDoc {
  if (samePad(a, b)) return doc;
  const exists = doc.wires.some((w) => (samePad(w.a, a) && samePad(w.b, b)) || (samePad(w.a, b) && samePad(w.b, a)));
  if (exists) return doc;
  let n = doc.wires.length + 1;
  const ids = new Set(doc.wires.map((w) => w.id));
  while (ids.has(`W${n}`)) n += 1;
  return { ...doc, wires: [...doc.wires, { id: `W${n}`, a, b }] };
}

export function deleteWire(doc: BuilderDoc, id: string): BuilderDoc {
  return { ...doc, wires: doc.wires.filter((w) => w.id !== id) };
}

// ─── nets ────────────────────────────────────────────────────────────────────

const key = (r: PadRef): string => `${r.ref}\u0000${r.pad}`;

/** Union-find over wired pads; returns pad key → net id. */
export function deriveNets(doc: BuilderDoc): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = k;
    while (parent.get(cur) !== root) { const next = parent.get(cur)!; parent.set(cur, root); cur = next; }
    return root;
  };
  const exists = (r: PadRef): boolean =>
    doc.parts.some((p) => p.ref === r.ref && TEMPLATES[p.kind].pads.some((pad) => pad.number === r.pad));

  for (const w of doc.wires) {
    if (!exists(w.a) || !exists(w.b)) continue;
    for (const r of [w.a, w.b]) if (!parent.has(key(r))) parent.set(key(r), key(r));
    const ra = find(key(w.a)), rb = find(key(w.b));
    if (ra !== rb) parent.set(ra, rb);
  }

  // Group members by root, in document order so names are stable.
  const groups = new Map<string, string[]>();
  for (const k of parent.keys()) {
    const root = find(k);
    groups.set(root, [...(groups.get(root) ?? []), k]);
  }

  const supplyPads = new Map<string, "pos" | "neg">();
  const supplyVolts = new Map<string, number>();
  for (const p of doc.parts) {
    if (p.model.type !== "vsource") continue;
    supplyPads.set(key({ ref: p.ref, pad: p.model.posPad }), "pos");
    supplyPads.set(key({ ref: p.ref, pad: p.model.negPad }), "neg");
    supplyVolts.set(key({ ref: p.ref, pad: p.model.posPad }), p.model.volts);
  }

  const names = new Map<string, string>();
  const taken = new Set<string>();
  const claim = (base: string): string => {
    let name = base, i = 2;
    while (taken.has(name)) name = `${base}_${i++}`;
    taken.add(name);
    return name;
  };
  let counter = 1;
  // Ground first so it always wins the plain "GND" name.
  const ordered = [...groups.values()].sort((a, b) => {
    const ga = a.some((k) => supplyPads.get(k) === "neg") ? 0 : 1;
    const gb = b.some((k) => supplyPads.get(k) === "neg") ? 0 : 1;
    return ga - gb;
  });
  for (const members of ordered) {
    let name: string;
    if (members.some((k) => supplyPads.get(k) === "neg")) name = claim("GND");
    else {
      const pos = members.find((k) => supplyPads.get(k) === "pos");
      if (pos) name = claim(`+${formatVolts(supplyVolts.get(pos) ?? 5)}V`);
      else { while (taken.has(`N${counter}`)) counter += 1; name = claim(`N${counter}`); }
    }
    for (const k of members) names.set(k, name);
  }
  return names;
}

const formatVolts = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** Build a normal Board from the document. */
export function docToBoard(doc: BuilderDoc): Board {
  const netOf = deriveNets(doc);

  const parts: Part[] = doc.parts.map((p) => {
    const tpl = TEMPLATES[p.kind];
    const pads: Pad[] = placedPads(p).map((pad) => {
      const tplPad = tpl.pads.find((t) => t.number === pad.number)!;
      return {
        number: pad.number,
        netId: netOf.get(key({ ref: p.ref, pad: pad.number })) ?? null,
        position: pad.at,
        sizeMm: { w: pad.w, h: pad.h },
        layers: layersFor(tplPad),
      };
    });
    return {
      ref: p.ref,
      value: valueLabel(p.model),
      kind: tpl.partKind,
      footprint: tpl.footprint,
      position: { x: p.x, y: p.y },
      rotationDeg: p.rotation,
      side: "top",
      body: tpl.body,
      pads,
      model: p.model,
      blurb: tpl.blurb,
    };
  });

  const netIds = new Set<string>(["GND", ...netOf.values()]);
  const nets: Net[] = [...netIds].map((id) => ({
    id,
    name: id,
    pads: parts.flatMap((part) => part.pads.filter((pad) => pad.netId === id).map((pad) => ({ ref: part.ref, pad: pad.number }))),
  }));

  const tracks: Track[] = [];
  for (const w of doc.wires) {
    const a = padPosition(doc, w.a), b = padPosition(doc, w.b);
    const netId = netOf.get(key(w.a));
    if (!a || !b || !netId) continue;
    const route = wireRoute(a, b);
    for (let i = 0; i + 1 < route.length; i++) {
      tracks.push({ netId, layer: "F.Cu", start: route[i]!, end: route[i + 1]!, widthMm: TRACE_WIDTH_MM });
    }
  }

  return {
    id: CUSTOM_BOARD_ID,
    name: doc.name,
    outline: [
      { x: 0, y: 0 }, { x: doc.widthMm, y: 0 }, { x: doc.widthMm, y: doc.heightMm }, { x: 0, y: doc.heightMm },
    ],
    thicknessMm: 1.6,
    copperLayers: ["F.Cu", "B.Cu"],
    parts,
    nets,
    tracks,
    vias: [],
    blocks: [],
    groundNetId: "GND",
  };
}

/** Which pads have no wire yet (for the amber "needs wiring" marks). */
export function unwiredPads(doc: BuilderDoc): Set<string> {
  const wired = new Set<string>();
  for (const w of doc.wires) { wired.add(key(w.a)); wired.add(key(w.b)); }
  const out = new Set<string>();
  for (const p of doc.parts) {
    for (const pad of TEMPLATES[p.kind].pads) {
      const k = key({ ref: p.ref, pad: pad.number });
      if (!wired.has(k)) out.add(k);
    }
  }
  return out;
}

export const padKey = key;

// ─── starter ─────────────────────────────────────────────────────────────────

/** A complete, working board: supply, MCU, resistor, LED. D8 HIGH lights the LED. */
export function blinkStarter(): BuilderDoc {
  let doc = blankDoc();
  doc = { ...doc, name: "Blink starter" };
  const place = (kind: TemplateKind, x: number, y: number): void => { doc = addPart(doc, kind, x, y).doc; };
  place("vsource", 7.62, 20.32);   // J1
  place("mcu", 24.13, 20.32);      // U1
  place("resistor", 39.37, 16.51); // R1
  place("led", 49.53, 16.51);      // D1
  doc = setPartModel(doc, "R1", { type: "resistor", ohms: 330 });
  const wire = (a: string, ap: string, b: string, bp: string): void => {
    doc = addWire(doc, { ref: a, pad: ap }, { ref: b, pad: bp });
  };
  wire("J1", "+", "U1", "VCC");
  wire("J1", "-", "U1", "GND");
  wire("U1", "D8", "R1", "1");
  wire("R1", "2", "D1", "A");
  wire("D1", "K", "U1", "GND");
  return doc;
}

export const BLINK_SKETCH = [
  "// Blink starter: D8 drives the LED through R1.",
  'pinMode(8, "OUTPUT");',
  "digitalWrite(8, HIGH);   // LED on. Try LOW, then Run again.",
  'log("LED current flows from D8 through R1 and D1 to ground");',
  "",
].join("\n");

/** Loose shape check for a document read back from storage. */
export function isBuilderDoc(value: unknown): value is BuilderDoc {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<BuilderDoc>;
  return typeof v.name === "string" && typeof v.widthMm === "number" && typeof v.heightMm === "number"
    && Array.isArray(v.parts) && Array.isArray(v.wires)
    && v.parts.every((p) => typeof p === "object" && p !== null && (p as PlacedPart).kind in TEMPLATES);
}
