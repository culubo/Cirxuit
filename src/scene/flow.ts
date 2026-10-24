/**
 * flow.ts — which way, and how fast, current runs along a net's wiring.
 * Shared by the board's particles (tracks) and the schematic's (wires), so
 * both show the same current in the same direction.
 *
 * Branch currents read "enters the part at fromPad, leaves at toPad". So on a
 * net, a branch's toPad is where current comes in (a source) and its fromPad is
 * where it goes out (a sink). Each segment is oriented to run toward the
 * nearest sink along the wiring (or away from the nearest source if the net has
 * no sink), using shortest paths over the net's segments.
 */
import type { Board, SimResult, Vec2 } from "../model/board-model";

/** Below this a net shows no flow. */
export const MIN_FLOW_A = 1e-5;

export interface PadRef {
  ref: string;
  pad: string;
}

/** The largest branch current touching a net. */
export function netCurrent(board: Board, sim: SimResult, netId: string): number {
  let max = 0;
  for (const br of sim.branches) {
    if (br.amps <= max) continue;
    const part = board.parts.find((p) => p.ref === br.ref);
    if (!part) continue;
    if (part.pads.some((pad) => (pad.number === br.fromPad || pad.number === br.toPad) && pad.netId === netId)) {
      max = br.amps;
    }
  }
  return max;
}

/** Where current enters (sources) and leaves (sinks) a net. */
export function netEndpoints(board: Board, sim: SimResult, netId: string): { sources: PadRef[]; sinks: PadRef[] } {
  const sources: PadRef[] = [];
  const sinks: PadRef[] = [];
  for (const br of sim.branches) {
    if (br.amps < MIN_FLOW_A) continue;
    const part = board.parts.find((p) => p.ref === br.ref);
    if (!part) continue;
    if (part.pads.some((p) => p.number === br.toPad && p.netId === netId)) sources.push({ ref: br.ref, pad: br.toPad });
    if (part.pads.some((p) => p.number === br.fromPad && p.netId === netId)) sinks.push({ ref: br.ref, pad: br.fromPad });
  }
  return { sources, sinks };
}

export interface Segment {
  a: Vec2;
  b: Vec2;
}

const key = (p: Vec2): string => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;

/** Shortest wiring distance from any seed to every segment endpoint. */
function distances(segments: Segment[], seeds: Vec2[]): Map<string, number> {
  const nodes = new Map<string, Vec2>();
  const adj = new Map<string, { to: string; w: number }[]>();
  const link = (p: Vec2, q: Vec2): void => {
    const kp = key(p), kq = key(q), w = Math.hypot(p.x - q.x, p.y - q.y);
    nodes.set(kp, p); nodes.set(kq, q);
    adj.set(kp, [...(adj.get(kp) ?? []), { to: kq, w }]);
    adj.set(kq, [...(adj.get(kq) ?? []), { to: kp, w }]);
  };
  for (const s of segments) link(s.a, s.b);

  const dist = new Map<string, number>();
  // A seed attaches to its nearest wiring node (pads usually sit on a segment end).
  for (const seed of seeds) {
    let best: string | null = null, bestD = Infinity;
    for (const [k, p] of nodes) {
      const d = Math.hypot(p.x - seed.x, p.y - seed.y);
      if (d < bestD) { bestD = d; best = k; }
    }
    if (best !== null && bestD < (dist.get(best) ?? Infinity)) dist.set(best, bestD);
  }

  // Dijkstra; nets are small, so a linear scan for the minimum is plenty.
  const done = new Set<string>();
  for (;;) {
    let cur: string | null = null, curD = Infinity;
    for (const [k, d] of dist) if (!done.has(k) && d < curD) { cur = k; curD = d; }
    if (cur === null) break;
    done.add(cur);
    for (const { to, w } of adj.get(cur) ?? []) {
      if (curD + w < (dist.get(to) ?? Infinity)) dist.set(to, curD + w);
    }
  }
  return dist;
}

/**
 * Direction for each segment: +1 runs a → b, −1 runs b → a, in the direction of
 * conventional current. Segments the current can't reach default to +1.
 */
export function orientSegments(segments: Segment[], sources: Vec2[], sinks: Vec2[]): number[] {
  if (sinks.length > 0) {
    const d = distances(segments, sinks);
    return segments.map((s) => {
      const da = d.get(key(s.a)) ?? Infinity, db = d.get(key(s.b)) ?? Infinity;
      return da > db ? 1 : da < db ? -1 : 1; // flow toward the sink
    });
  }
  if (sources.length > 0) {
    const d = distances(segments, sources);
    return segments.map((s) => {
      const da = d.get(key(s.a)) ?? Infinity, db = d.get(key(s.b)) ?? Infinity;
      return da < db ? 1 : da > db ? -1 : 1; // flow away from the source
    });
  }
  return segments.map(() => 1);
}

/** Particle speed (board mm/s) for a net carrying `frac` of the board's largest current. */
export function particleSpeed(frac: number): number {
  return 6 + 26 * Math.sqrt(Math.max(0, frac));
}

/** Particles per segment for a net carrying `frac` of the board's largest current. */
export function particleCount(frac: number, base = 6): number {
  return Math.max(1, Math.round(base * Math.max(0, frac)));
}
