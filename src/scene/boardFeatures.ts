/**
 * boardFeatures.ts — pure board-level geometry derived from the board data:
 * outline bounds and the mounting holes a fab would drill.
 */
import type { Board, Vec2 } from "../model/board-model";
import { landPattern } from "./footprint";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export function outlineBounds(outline: Vec2[]): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of outline) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export interface MountingHole {
  position: Vec2;
  drillMm: number;
}

/** M2 clearance holes, 3 mm in from each corner. */
const HOLE_DRILL = 2.2;
const HOLE_INSET = 3;
/** Keep holes at least this far from copper and part bodies. */
const HOLE_KEEPOUT = 1;

function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Corner mounting holes for a rectangular board, dropping any corner where a
 * hole would collide with copper or a part. Non-rectangular outlines get none.
 */
export function mountingHoles(board: Board): MountingHole[] {
  if (board.outline.length !== 4) return [];
  const b = outlineBounds(board.outline);
  if (b.width < 20 || b.height < 20) return [];
  const r = HOLE_DRILL / 2 + HOLE_KEEPOUT;
  const corners: Vec2[] = [
    { x: b.minX + HOLE_INSET, y: b.minY + HOLE_INSET },
    { x: b.maxX - HOLE_INSET, y: b.minY + HOLE_INSET },
    { x: b.maxX - HOLE_INSET, y: b.maxY - HOLE_INSET },
    { x: b.minX + HOLE_INSET, y: b.maxY - HOLE_INSET },
  ];
  return corners
    .filter((c) => board.tracks.every((t) => segmentDistance(c, t.start, t.end) > r + t.widthMm / 2))
    .filter((c) => board.vias.every((v) => Math.hypot(c.x - v.position.x, c.y - v.position.y) > r + v.diameterMm / 2))
    .filter((c) => board.parts.every((p) => {
      const reach = Math.hypot(p.body.w, p.body.h) / 2;
      const padsClear = landPattern(p).every((pad) => Math.hypot(c.x - pad.position.x, c.y - pad.position.y) > r + Math.max(pad.sizeMm.w, pad.sizeMm.h));
      return padsClear && Math.hypot(c.x - p.position.x, c.y - p.position.y) > r + reach;
    }))
    .map((position) => ({ position, drillMm: HOLE_DRILL }));
}
