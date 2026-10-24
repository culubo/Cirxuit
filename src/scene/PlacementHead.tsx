/**
 * PlacementHead — the pick-and-place nozzle that builds the board during the
 * assembly sequence: it carries each part down into place, lifts, and travels
 * to the next one. Hidden when no build is running.
 */
import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Board, Part } from "../model/board-model";
import { assemblyOrder, assemblyElapsed, DROP_S, HOVER_MM, headPosition, landing, useAssembly } from "./assembly";
import { machine } from "./palette";

const LIFT_MM = HOVER_MM + 6;

function ease(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export default function PlacementHead({ board }: { board: Board }): React.ReactElement {
  const head = useRef<THREE.Group>(null);
  const order = useMemo(() => assemblyOrder(board.parts), [board.parts]);
  const materials = useMemo(() => ({
    body: new THREE.MeshStandardMaterial({ color: machine.headBody, roughness: 0.45, metalness: 0.6 }),
    nozzle: new THREE.MeshStandardMaterial({ color: machine.nozzle, roughness: 0.25, metalness: 1 }),
    tip: new THREE.MeshStandardMaterial({ color: machine.tip, roughness: 0.6, metalness: 0 }),
  }), []);

  useFrame(() => {
    const g = head.current;
    if (!g) return;
    place(g);
    headPosition.copy(g.position);
  });

  function place(g: THREE.Group): void {
    const state = useAssembly.getState();
    const { startedAt, placements, duration, boardId } = state;
    if (startedAt === null || boardId !== board.id) { g.visible = false; return; }
    const t = assemblyElapsed(state);
    if (t > duration + 0.6) { g.visible = false; return; }
    g.visible = true;

    const at = (p: Part) => placements.get(p.ref)?.at ?? 0;
    const top = (p: Part) => p.body.height;
    // The part being placed now, or the last one placed.
    let i = -1;
    while (i + 1 < order.length && at(order[i + 1]!) <= t) i++;
    const cur = order[i];
    const next = order[i + 1];

    if (cur && t - at(cur) <= DROP_S) {
      // Descending with the part held on the nozzle.
      const k = landing((t - at(cur)) / DROP_S);
      g.position.set(cur.position.x, -cur.position.y, top(cur) + HOVER_MM * (1 - k));
      return;
    }
    const from = cur ?? order[0];
    if (!from) return;
    if (!next) {
      // Done: lift clear.
      g.position.set(from.position.x, -from.position.y, top(from) + LIFT_MM * ease((t - at(from) - DROP_S) / 0.6));
      return;
    }
    // Lift, travel, and lower toward the next part.
    const start = cur ? at(cur) + DROP_S : 0;
    const u = (t - start) / Math.max(0.05, at(next) - start);
    const xy = ease(u);
    g.position.set(
      from.position.x + (next.position.x - from.position.x) * xy,
      -(from.position.y + (next.position.y - from.position.y) * xy),
      Math.max(top(from), top(next)) + HOVER_MM + Math.sin(Math.min(1, u) * Math.PI) * 4,
    );
  }

  return (
    <group ref={head} visible={false}>
      {/* Vacuum tip, nozzle shaft, and the head housing above it (z up from the tip). */}
      <mesh material={materials.tip} position={[0, 0, 0.6]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.35, 0.5, 1.2, 20]} />
      </mesh>
      <mesh material={materials.nozzle} position={[0, 0, 4.2]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null} castShadow>
        <cylinderGeometry args={[0.7, 0.7, 6, 24]} />
      </mesh>
      <mesh material={materials.body} position={[0, 0, 15]} raycast={() => null} castShadow>
        <boxGeometry args={[3.6, 3.6, 10]} />
      </mesh>
    </group>
  );
}
