/**
 * BuildReplay — watch a built-in board being laid out, in the editor's style.
 *
 * The sequence a designer follows: board outline, footprints placed block by
 * block, the ratsnest (unrouted connections) appearing, then every net routed
 * trace by trace on top and bottom copper, vias last. Read-only: it plays the
 * real board data (lands, tracks, vias) with CSS animation delays, so nothing
 * re-renders per frame.
 */
import React, { useEffect, useMemo, useState } from "react";
import type { Board, Part, Vec2 } from "../model/board-model";
import { boardEntry } from "../model/board-registry";
import { useStore } from "../store/useStore";
import { isThroughHole, landPattern } from "../scene/footprint";
import { backdrop, button, font } from "../ui/chrome";
import { tokens } from "../ui/tokens";
import { pcb } from "../scene/palette";

const MARGIN = 4;
// Timeline, seconds.
const OUTLINE_S = 0.9;
const PART_STEP_S = 0.16;
const RATSNEST_FADE_S = 0.5;
const NET_STEP_S = 0.18;
const TRACK_STEP_S = 0.022;
const TRACK_DRAW_S = 0.28;

/** Prim's minimum spanning tree over a net's pads: the ratsnest a CAD tool shows. */
function ratsnest(points: Vec2[]): [Vec2, Vec2][] {
  if (points.length < 2) return [];
  const inTree = [points[0]!];
  const rest = points.slice(1);
  const edges: [Vec2, Vec2][] = [];
  while (rest.length) {
    let best = { d: Infinity, i: 0, from: inTree[0]! };
    rest.forEach((p, i) => {
      for (const q of inTree) {
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < best.d) best = { d, i, from: q };
      }
    });
    const [p] = rest.splice(best.i, 1);
    edges.push([best.from, p!]);
    inTree.push(p!);
  }
  return edges;
}

/** Silkscreen-style outline: the part's lands and body, axis-aligned. */
function outline(part: Part): { x: number; y: number; w: number; h: number } {
  const quarter = Math.abs(part.rotationDeg % 180) === 90;
  const bw = quarter ? part.body.h : part.body.w, bh = quarter ? part.body.w : part.body.h;
  let minX = part.position.x - bw / 2, maxX = part.position.x + bw / 2;
  let minY = part.position.y - bh / 2, maxY = part.position.y + bh / 2;
  for (const pad of landPattern(part)) {
    minX = Math.min(minX, pad.position.x - pad.sizeMm.w / 2); maxX = Math.max(maxX, pad.position.x + pad.sizeMm.w / 2);
    minY = Math.min(minY, pad.position.y - pad.sizeMm.h / 2); maxY = Math.max(maxY, pad.position.y + pad.sizeMm.h / 2);
  }
  return { x: minX - 0.3, y: minY - 0.3, w: maxX - minX + 0.6, h: maxY - minY + 0.6 };
}

interface Timeline {
  partAt: Map<string, number>;
  ratsnestAt: number;
  nets: { netId: string; at: number; done: number; edges: [Vec2, Vec2][] }[];
  trackAt: number[];
  viaAt: number;
  end: number;
}

function timeline(board: Board): Timeline {
  // Footprints go down block by block (as a designer groups them), left to right within a block.
  const blockOf = new Map<string, number>();
  board.blocks.forEach((b, i) => b.partRefs.forEach((r) => blockOf.set(r, i)));
  const parts = [...board.parts].sort((a, b) =>
    (blockOf.get(a.ref) ?? 99) - (blockOf.get(b.ref) ?? 99) || a.position.x - b.position.x || a.position.y - b.position.y);
  const partAt = new Map<string, number>();
  let t = OUTLINE_S;
  for (const p of parts) { partAt.set(p.ref, t); t += PART_STEP_S; }
  const ratsnestAt = t + 0.2;
  t = ratsnestAt + RATSNEST_FADE_S + 0.3;

  // Route power and ground first, then signals, as you would by hand.
  const priority = (net: string) => (net === board.groundNetId ? 1 : /^\+|VIN|VBAT/.test(net) ? 0 : 2);
  const netIds = [...new Set(board.tracks.map((tr) => tr.netId))].sort((a, b) => priority(a) - priority(b) || a.localeCompare(b, undefined, { numeric: true }));
  const trackAt: number[] = board.tracks.map(() => 0);
  const nets: Timeline["nets"] = [];
  for (const netId of netIds) {
    const start = t;
    board.tracks.forEach((tr, i) => {
      if (tr.netId !== netId) return;
      trackAt[i] = t;
      t += TRACK_STEP_S;
    });
    const pads = board.parts.flatMap((p) => p.pads.filter((d) => d.netId === netId).map((d) => d.position));
    nets.push({ netId, at: start, done: t + TRACK_DRAW_S, edges: ratsnest(pads) });
    t = Math.max(t, start + NET_STEP_S);
  }
  const viaAt = t + 0.2;
  return { partAt, ratsnestAt, nets, trackAt, viaAt, end: viaAt + 0.8 };
}

const CSS = `
.br-pop { opacity: 0; transform-box: fill-box; transform-origin: center; animation: br-pop .32s cubic-bezier(.2,.8,.3,1.2) both; }
@keyframes br-pop { from { opacity: 0; transform: scale(1.8); } to { opacity: 1; transform: scale(1); } }
.br-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: br-draw ${TRACK_DRAW_S}s ease-out both; }
@keyframes br-draw { to { stroke-dashoffset: 0; } }
.br-rat { opacity: 0; animation: br-in ${RATSNEST_FADE_S}s ease-out both, br-out .25s ease-in both; }
@keyframes br-in { to { opacity: .75; } }
@keyframes br-out { from { opacity: .75; } to { opacity: 0; } }
.br-fade { opacity: 0; animation: br-fade .5s ease-out both; }
@keyframes br-fade { to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .br-pop, .br-draw, .br-rat, .br-fade { animation-duration: .01s !important; } }
`;

export default function BuildReplay({ boardId, onClose }: { boardId: string; onClose: () => void }): React.ReactElement {
  const [board, setBoard] = useState<Board | null>(null);
  const [run, setRun] = useState(0);
  const [finished, setFinished] = useState(false);
  const setBoardId = useStore((s) => s.setBoardId);
  const setMode = useStore((s) => s.setMode);

  useEffect(() => {
    let live = true;
    void boardEntry(boardId)?.load().then((b) => { if (live) setBoard(b); });
    return () => { live = false; };
  }, [boardId]);

  const tl = useMemo(() => (board ? timeline(board) : null), [board]);
  useEffect(() => {
    if (!tl) return;
    setFinished(false);
    const id = window.setTimeout(() => setFinished(true), tl.end * 1000);
    return () => window.clearTimeout(id);
  }, [tl, run]);

  if (!board || !tl) {
    return <div style={{ ...font, padding: "1rem", color: tokens.textDim, fontSize: "0.75rem" }}>Loading the board…</div>;
  }

  const xs = board.outline.map((p) => p.x), ys = board.outline.map((p) => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), w = Math.max(...xs) - minX, h = Math.max(...ys) - minY;
  const d = (s: number): React.CSSProperties => ({ animationDelay: `${s.toFixed(3)}s` });

  return (
    <div data-testid="build-replay" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: backdrop, zIndex: 30 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.4rem 0.6rem", borderBottom: `1px solid ${tokens.hairline}` }}>
        <button onClick={() => setRun((n) => n + 1)} style={button()}>↻ Replay</button>
        <button
          onClick={() => { setBoardId(boardId); setMode("simulate"); }}
          style={button({ primary: true })}
          title="Open this board in Simulate"
        >
          ▶ Simulate this board
        </button>
        <button data-testid="build-replay-close" onClick={onClose} style={button()}>Back to editor</button>
        <span style={{ ...font, marginLeft: "0.6rem", fontSize: "0.72rem", color: tokens.textDim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {finished
            ? `${board.name}: ${board.parts.length} parts placed, ${board.tracks.length} tracks and ${board.vias.length} vias routed, nothing left unrouted.`
            : `Laying out ${board.name}: footprints first, then the ratsnest, then every net routed.`}
        </span>
      </div>

      <svg key={run} viewBox={`${minX - MARGIN} ${minY - MARGIN} ${w + MARGIN * 2} ${h + MARGIN * 2}`} preserveAspectRatio="xMidYMid meet" style={{ flex: 1, minHeight: 0, width: "100%" }}>
        <style>{CSS}</style>
        <defs>
          {/* User-space region: straight traces have a zero-height bounding box, which would clip a bbox-relative filter to nothing. */}
          <filter id="br-glow" filterUnits="userSpaceOnUse" x={minX - MARGIN} y={minY - MARGIN} width={w + MARGIN * 2} height={h + MARGIN * 2}>
            <feGaussianBlur stdDeviation="0.3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Board outline */}
        <rect className="br-fade" x={minX} y={minY} width={w} height={h} rx={2.4} fill={pcb.mask} style={d(OUTLINE_S * 0.6)} />
        <rect className="br-draw" pathLength={1} x={minX} y={minY} width={w} height={h} rx={2.4} fill="none" stroke={pcb.maskOverCopper} strokeWidth={0.3} style={d(0)} />
        <text className="br-fade" x={minX} y={minY - 1.2} fontSize={1.6} fill={tokens.textFaint} style={{ ...d(0.2), fontFamily: tokens.fontMono }}>
          {board.name} · {w} × {h} mm
        </text>

        {/* Bottom copper under everything, dimmer */}
        {board.tracks.map((tr, i) => tr.layer !== "B.Cu" ? null : (
          <line key={`b${i}`} className="br-draw" pathLength={1} x1={tr.start.x} y1={tr.start.y} x2={tr.end.x} y2={tr.end.y}
            stroke="#2a7fc0" strokeOpacity={0.75} strokeWidth={tr.widthMm} strokeLinecap="round" style={d(tl.trackAt[i]!)} />
        ))}

        {/* Ratsnest: appears once every footprint is down, each net's lines vanish as it is routed */}
        {tl.nets.flatMap((net) => net.edges.map(([a, b], k) => (
          <line key={`r-${net.netId}-${k}`} className="br-rat" x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke="#e8f4ff" strokeWidth={0.12} strokeDasharray="0.5 0.35"
            style={{ animationDelay: `${tl.ratsnestAt}s, ${net.done}s` }} />
        )))}

        {/* Top copper */}
        {board.tracks.map((tr, i) => tr.layer === "B.Cu" ? null : (
          <line key={`f${i}`} className="br-draw" pathLength={1} x1={tr.start.x} y1={tr.start.y} x2={tr.end.x} y2={tr.end.y}
            stroke="#3fb6f0" strokeWidth={tr.widthMm} strokeLinecap="round" filter="url(#br-glow)" style={d(tl.trackAt[i]!)} />
        ))}

        {/* Footprints: outline, lands, reference */}
        {board.parts.map((part) => {
          const at = tl.partAt.get(part.ref) ?? 0;
          const box = outline(part);
          return (
            <g key={part.ref} className="br-pop" style={d(at)}>
              <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={0.3} fill="#10141c" fillOpacity={0.55} stroke="#2a4a6e" strokeWidth={0.15} />
              {landPattern(part).map((pad, k) => isThroughHole(pad) ? (
                <g key={k}>
                  <circle cx={pad.position.x} cy={pad.position.y} r={Math.min(pad.sizeMm.w, pad.sizeMm.h) / 2} fill="#bff0ff" />
                  <circle cx={pad.position.x} cy={pad.position.y} r={Math.min(pad.sizeMm.w, pad.sizeMm.h) * 0.28} fill="#081a36" />
                </g>
              ) : (
                <rect key={k} x={pad.position.x - pad.sizeMm.w / 2} y={pad.position.y - pad.sizeMm.h / 2} width={pad.sizeMm.w} height={pad.sizeMm.h} rx={0.12}
                  fill="#bff0ff" fillOpacity={pad.netId ? 1 : 0.45} />
              ))}
              <text x={box.x + box.w / 2} y={box.y - 0.5} fontSize={1.1} textAnchor="middle" fill={tokens.text} style={{ fontFamily: tokens.fontMono }}>
                {part.ref}
              </text>
            </g>
          );
        })}

        {/* Vias last */}
        {board.vias.map((v, i) => (
          <g key={`v${i}`} className="br-pop" style={d(tl.viaAt + i * 0.03)}>
            <circle cx={v.position.x} cy={v.position.y} r={v.diameterMm / 2} fill="#3fb6f0" />
            <circle cx={v.position.x} cy={v.position.y} r={v.drillMm / 2} fill="#081a36" />
          </g>
        ))}
      </svg>
    </div>
  );
}
