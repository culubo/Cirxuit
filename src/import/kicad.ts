import type { Board, CopperLayer, Net, Pad, Part, Track, Vec2, Via } from "../model/board-model";

type SExpr = string | SExpr[];
type List = SExpr[];

/** Parse KiCad's parenthesized, quoted S-expression format. */
export function parseSExpressions(source: string): SExpr[] {
  const tokens: Array<string | { quoted: string }> = [];
  for (let i = 0; i < source.length;) {
    const char = source.charAt(i);
    if (/\s/.test(char)) { i++; continue; }
    if (char === ';') { while (i < source.length && source[i] !== '\n') i++; continue; }
    if (char === '(' || char === ')') { tokens.push(char); i++; continue; }
    if (char === '"') {
      let value = "";
      i++;
      let closed = false;
      while (i < source.length) {
        const next = source.charAt(i++);
        if (next === '"') { closed = true; break; }
        if (next === '\\') {
          if (i >= source.length) throw new Error("Unterminated escape in KiCad string");
          const escaped = source.charAt(i++);
          value += escaped === 'n' ? '\n' : escaped === 't' ? '\t' : escaped;
        } else value += next;
      }
      if (!closed) throw new Error("Unterminated KiCad string");
      tokens.push({ quoted: value });
      continue;
    }
    const start = i;
    while (i < source.length && !/[\s();"]/.test(source.charAt(i))) i++;
    tokens.push(source.slice(start, i));
  }
  const roots: SExpr[] = [];
  const stack: List[] = [];
  for (const token of tokens) {
    if (token === '(') {
      const list: List = [];
      const parent = stack.at(-1);
      if (parent) parent.push(list);
      else roots.push(list);
      stack.push(list);
    } else if (token === ')') {
      if (!stack.length) throw new Error("Unexpected ')' in KiCad file");
      stack.pop();
    } else {
      const current = stack.at(-1);
      if (!current) throw new Error("Unexpected atom outside KiCad expression");
      current.push(typeof token === "string" ? token : token.quoted);
    }
  }
  if (stack.length) throw new Error("Unclosed '(' in KiCad file");
  return roots;
}

function children(node: List, key: string): List[] {
  return node.filter((item): item is List => Array.isArray(item) && item[0] === key);
}
function child(node: List, key: string): List | undefined { return children(node, key)[0]; }
function atom(node: List | undefined, index: number, fallback = ""): string {
  const value = node?.[index];
  return typeof value === "string" ? value : fallback;
}
function number(node: List | undefined, index: number, fallback = 0): number {
  const value = Number(atom(node, index));
  return Number.isFinite(value) ? value : fallback;
}
function point(node: List | undefined): Vec2 { return { x: number(node, 1), y: number(node, 2) }; }
function isCopperLayer(value: string): value is CopperLayer {
  return value === "F.Cu" || value === "B.Cu" || value === "In1.Cu" || value === "In2.Cu";
}
function firstPoint(path: Vec2[]): Vec2 {
  const first = path[0];
  if (!first) throw new Error("Empty Edge.Cuts path");
  return first;
}
function lastPoint(path: Vec2[]): Vec2 {
  const last = path.at(-1);
  if (!last) throw new Error("Empty Edge.Cuts path");
  return last;
}
function samePoint(a: Vec2, b: Vec2): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < 1e-4;
}
function rotate(local: Vec2, origin: Vec2, degrees: number): Vec2 {
  const angle = degrees * Math.PI / 180;
  return {
    x: origin.x + local.x * Math.cos(angle) + local.y * Math.sin(angle),
    y: origin.y - local.x * Math.sin(angle) + local.y * Math.cos(angle),
  };
}
function arcPoints(start: Vec2, middle: Vec2, end: Vec2): Vec2[] {
  const denominator = 2 * (start.x * (middle.y - end.y) + middle.x * (end.y - start.y) + end.x * (start.y - middle.y));
  if (Math.abs(denominator) < 1e-9) return [start, end];
  const square = (p: Vec2): number => p.x * p.x + p.y * p.y;
  const cx = (square(start) * (middle.y - end.y) + square(middle) * (end.y - start.y) + square(end) * (start.y - middle.y)) / denominator;
  const cy = (square(start) * (end.x - middle.x) + square(middle) * (start.x - end.x) + square(end) * (middle.x - start.x)) / denominator;
  const center = { x: cx, y: cy };
  const angle = (p: Vec2): number => Math.atan2(p.y - cy, p.x - cx);
  const full = 2 * Math.PI;
  const ccw = (a: number, b: number): number => (b - a + full) % full;
  const a0 = angle(start), am = angle(middle), ae = angle(end);
  const sweep = ccw(a0, am) <= ccw(a0, ae) ? ccw(a0, ae) : ccw(a0, ae) - full;
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 18)));
  const radius = Math.hypot(start.x - cx, start.y - cy);
  return Array.from({ length: steps + 1 }, (_, i) => i === 0 ? start : i === steps ? end : {
    x: center.x + radius * Math.cos(a0 + sweep * i / steps),
    y: center.y + radius * Math.sin(a0 + sweep * i / steps),
  });
}
function edgePaths(root: List): Vec2[] {
  const paths: Vec2[][] = [];
  const edge = (node: List): boolean => atom(child(node, "layer"), 1) === "Edge.Cuts";
  for (const item of children(root, "gr_line")) if (edge(item)) paths.push([point(child(item, "start")), point(child(item, "end"))]);
  for (const item of children(root, "gr_arc")) if (edge(item)) paths.push(arcPoints(point(child(item, "start")), point(child(item, "mid")), point(child(item, "end"))));
  for (const item of children(root, "gr_rect")) if (edge(item)) {
    const a = point(child(item, "start")), b = point(child(item, "end"));
    paths.push([a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a]);
  }
  for (const item of children(root, "gr_poly")) if (edge(item)) {
    const points = children(child(item, "pts") ?? [], "xy").map(point);
    if (points.length) paths.push([...points, firstPoint(points)]);
  }
  if (!paths.length) return [];
  // Edge.Cuts is usually a set of unordered line segments. Join their matching endpoints.
  const remaining = paths.slice();
  const initial = remaining.shift();
  if (!initial) return [];
  let outline = initial;
  while (remaining.length && !samePoint(firstPoint(outline), lastPoint(outline))) {
    const tail = lastPoint(outline);
    const index = remaining.findIndex((path) => samePoint(firstPoint(path), tail) || samePoint(lastPoint(path), tail));
    if (index < 0) break;
    const path = remaining.splice(index, 1)[0];
    if (!path) throw new Error("Missing Edge.Cuts path");
    if (!samePoint(firstPoint(path), tail)) path.reverse();
    outline = outline.concat(path.slice(1));
  }
  if (!samePoint(firstPoint(outline), lastPoint(outline))) throw new Error("Edge.Cuts outline is not closed");
  if (remaining.length) throw new Error("Edge.Cuts contains multiple outlines; Board supports one polygon");
  return outline;
}

/** Import KiCad 7/8 PCB geometry and connectivity. Models must be assigned separately. */
export function parseKiCadPcb(source: string, name = "Imported KiCad board"): Board {
  const roots = parseSExpressions(source);
  const root = roots.find((item): item is List => Array.isArray(item) && item[0] === "kicad_pcb");
  if (!root) throw new Error("Expected a kicad_pcb root expression");
  const netNames = new Map<string, string>();
  for (const net of children(root, "net")) netNames.set(atom(net, 1), atom(net, 2));
  const netMap = new Map<string, Net>();
  for (const [id, netName] of netNames) if (id !== "0") netMap.set(id, { id, name: netName, pads: [] });
  const usedLayers = new Set<CopperLayer>();
  for (const entry of child(root, "layers") ?? []) if (Array.isArray(entry)) {
    const label = atom(entry, 1);
    if (isCopperLayer(label)) usedLayers.add(label);
  }
  const ensureNet = (id: string, label = ""): string | null => {
    if (!id || id === "0") return null;
    if (!netMap.has(id)) netMap.set(id, { id, name: label || netNames.get(id) || `Net ${id}`, pads: [] });
    return id;
  };
  const parts: Part[] = [];
  for (const fp of children(root, "footprint")) {
    const at = child(fp, "at");
    const origin = point(at);
    const rotationDeg = number(at, 3);
    const fpLayer = atom(child(fp, "layer"), 1, "F.Cu");
    const side = fpLayer.startsWith("B.") ? "bottom" : "top";
    const property = (key: string): string => atom(children(fp, "property").find((p) => atom(p, 1) === key), 2);
    const text = (key: string): string => atom(children(fp, "fp_text").find((p) => atom(p, 1) === key), 2);
    const ref = property("Reference") || text("reference");
    if (!ref) throw new Error("Footprint has no reference");
    const value = property("Value") || text("value");
    const pads: Pad[] = children(fp, "pad").map((entry) => {
      const padAt = child(entry, "at");
      const local = point(padAt);
      const net = child(entry, "net");
      const netId = ensureNet(atom(net, 1), atom(net, 2));
      const layers = (child(entry, "layers") ?? []).slice(1)
        .filter((layer): layer is string => typeof layer === "string")
        .flatMap((layer): CopperLayer[] => layer === "*.Cu" ? [...usedLayers] : isCopperLayer(layer) ? [layer] : []);
      const pad: Pad = {
        number: atom(entry, 1), netId,
        position: rotate(local, origin, side === "bottom" ? -rotationDeg : rotationDeg),
        sizeMm: { w: number(child(entry, "size"), 1), h: number(child(entry, "size"), 2) },
        layers: [...new Set(layers)],
      };
      if (netId !== null) netMap.get(netId)!.pads.push({ ref, pad: pad.number });
      for (const layer of pad.layers) usedLayers.add(layer);
      return pad;
    });
    const bounds = pads.reduce((acc, pad) => ({
      minX: Math.min(acc.minX, pad.position.x - pad.sizeMm.w / 2),
      maxX: Math.max(acc.maxX, pad.position.x + pad.sizeMm.w / 2),
      minY: Math.min(acc.minY, pad.position.y - pad.sizeMm.h / 2),
      maxY: Math.max(acc.maxY, pad.position.y + pad.sizeMm.h / 2),
    }), { minX: origin.x, maxX: origin.x, minY: origin.y, maxY: origin.y });
    parts.push({
      ref, value, kind: "unknown", footprint: atom(fp, 1), position: origin, rotationDeg, side,
      body: { w: Math.max(1, bounds.maxX - bounds.minX), h: Math.max(1, bounds.maxY - bounds.minY), height: 1 }, pads,
    });
  }
  const tracks: Track[] = children(root, "segment").map((segment) => {
    const label = atom(child(segment, "layer"), 1);
    if (!isCopperLayer(label)) throw new Error(`Unsupported copper layer ${label}`);
    usedLayers.add(label);
    return {
      netId: ensureNet(atom(child(segment, "net"), 1)) ?? "0", layer: label,
      start: point(child(segment, "start")), end: point(child(segment, "end")),
      widthMm: number(child(segment, "width"), 1),
    };
  });
  const vias: Via[] = children(root, "via").map((via) => ({
    netId: ensureNet(atom(child(via, "net"), 1)) ?? "0",
    position: point(child(via, "at")),
    drillMm: number(child(via, "drill"), 1),
    diameterMm: number(child(via, "size"), 1),
  }));
  const ground = [...netMap.values()].find((net) => /^(GND|GROUND|0|\/GND)$/i.test(net.name));
  const groundNetId = ground?.id ?? [...netMap.keys()][0] ?? "0";
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    name, outline: edgePaths(root), thicknessMm: number(child(child(root, "general") ?? [], "thickness") ?? child(child(root, "setup") ?? [], "thickness"), 1, 1.6),
    copperLayers: [...usedLayers], parts, nets: [...netMap.values()], tracks, vias, blocks: [], groundNetId,
  };
}

export const importKiCad = parseKiCadPcb;
