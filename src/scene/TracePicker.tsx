/**
 * TracePicker — makes copper traces hoverable and clickable.
 *
 * Traces are baked into textures, so they have no meshes to hit. Instead an
 * invisible plane just above the top copper (and one just below the bottom
 * copper, once the board is exploded) catches the pointer and finds the nearest
 * trace under it. Hovering a trace highlights its net; clicking selects it.
 * A trace never steals a hover from a part sitting on top of it.
 */
import React, { useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { Board, Track } from "../model/board-model";
import { useStore } from "../store/useStore";
import { copperZ } from "./layers";
import { useExplodeSpring } from "./useExplodeSpring";

/** Extra reach around a trace's edge, mm. */
const SLOP = 0.6;

function distanceToTrack(x: number, y: number, t: Track): number {
  const ax = t.start.x, ay = t.start.y, bx = t.end.x, by = t.end.y;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
  return Math.hypot(x - (ax + u * dx), y - (ay + u * dy));
}

export function traceAt(board: Board, layer: "F.Cu" | "B.Cu", x: number, y: number): Track | null {
  let best: Track | null = null, bestD = Infinity;
  for (const t of board.tracks) {
    if (t.layer !== layer) continue;
    const d = distanceToTrack(x, y, t) - t.widthMm / 2;
    if (d < SLOP && d < bestD) { best = t; bestD = d; }
  }
  return best;
}

export default function TracePicker({ board }: { board: Board }): React.ReactElement {
  const bounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of board.outline) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    return { cx: (minX + maxX) / 2, cy: -(minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
  }, [board]);

  const top = useRef<THREE.Mesh>(null);
  const bottom = useRef<THREE.Mesh>(null);
  useExplodeSpring((f) => {
    if (top.current) top.current.position.z = copperZ("F.Cu", f, board.thicknessMm) + 0.08;
    if (bottom.current) {
      bottom.current.position.z = copperZ("B.Cu", f, board.thicknessMm) - 0.08;
      // Collapsed, the bottom copper is inside the board; only pick it apart.
      bottom.current.visible = f > 0.15;
    }
  });

  const handlers = (layer: "F.Cu" | "B.Cu") => ({
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      const s = useStore.getState();
      const t = traceAt(board, layer, e.point.x, -e.point.y);
      if (t) {
        if (s.hover?.kind !== "part") s.setHover({ kind: "net", netId: t.netId });
      } else if (s.hover?.kind === "net") {
        s.setHover(null);
      }
    },
    onPointerOut: () => {
      const s = useStore.getState();
      if (s.hover?.kind === "net") s.setHover(null);
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      const t = traceAt(board, layer, e.point.x, -e.point.y);
      if (!t) return; // let the click fall through to deselect
      e.stopPropagation();
      useStore.getState().setSelection({ kind: "net", netId: t.netId });
    },
  });

  return (
    <group>
      <mesh ref={top} position={[bounds.cx, bounds.cy, 0.08]} {...handlers("F.Cu")}>
        <planeGeometry args={[bounds.w, bounds.h]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      <mesh ref={bottom} position={[bounds.cx, bounds.cy, -board.thicknessMm]} rotation={[Math.PI, 0, 0]} visible={false} {...handlers("B.Cu")}>
        <planeGeometry args={[bounds.w, bounds.h]} />
        <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
