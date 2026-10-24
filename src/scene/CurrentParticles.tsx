/**
 * CurrentParticles — animated conventional-current flow.
 *
 * All particles live in ONE InstancedMesh for performance. Each particle is
 * bound to a conducting track segment and advances along it every frame. Speed
 * and particle count per track scale with |I|, so heavier current reads as
 * faster and denser. Additive blending + the scene Bloom make them glow.
 *
 * Direction is conventional current (high→low potential along the net); the
 * electron-flow toggle reverses it.
 */
import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../store/useStore";
import type { Board, SimResult, Track, Vec2 } from "../model/board-model";
import { tokens } from "../ui/tokens";
import { copperZ } from "./layers";
import { useExplodeSpring } from "./useExplodeSpring";
import { MIN_FLOW_A, netCurrent, netEndpoints, orientSegments, particleCount, particleSpeed } from "./flow";

const MAX_PARTICLES = 600;          // fps budget
const MIN_CURRENT_A = MIN_FLOW_A;   // below this a track shows no flow
/** Particles ride just outside their copper layer's face. */
const LIFT = 0.06;

interface Segment {
  a: THREE.Vector3;       // start (three space, z = 0)
  b: THREE.Vector3;       // end
  layer: string;
  size: number;           // particle diameter, scaled to the trace width
  dir: number;            // +1 a→b, -1 b→a (conventional current)
  speed: number;          // units/sec along the segment
  count: number;          // particles on this segment
}

/** Board-space Vec2 → three-space position on the board plane. */
function toThree(p: Vec2): THREE.Vector3 {
  return new THREE.Vector3(p.x, -p.y, 0);
}

/**
 * Direction of conventional current along every track: per net, from where
 * current enters (a branch's toPad) toward where it leaves (a fromPad), along
 * the net's wiring. Shared with the schematic's particles via flow.ts.
 */
function trackDirections(board: Board, sim: SimResult): Map<Track, number> {
  const out = new Map<Track, number>();
  const padPos = (ref: string, pad: string): Vec2 | null =>
    board.parts.find((p) => p.ref === ref)?.pads.find((p) => p.number === pad)?.position ?? null;
  const byNet = new Map<string, Track[]>();
  for (const t of board.tracks) byNet.set(t.netId, [...(byNet.get(t.netId) ?? []), t]);
  for (const [netId, tracks] of byNet) {
    const { sources, sinks } = netEndpoints(board, sim, netId);
    const dirs = orientSegments(
      tracks.map((t) => ({ a: t.start, b: t.end })),
      sources.map((r) => padPos(r.ref, r.pad)).filter((p): p is Vec2 => p !== null),
      sinks.map((r) => padPos(r.ref, r.pad)).filter((p): p is Vec2 => p !== null),
    );
    tracks.forEach((t, i) => out.set(t, dirs[i] ?? 1));
  }
  return out;
}

export default function CurrentParticles(): React.ReactElement | null {
  const board = useStore((s) => s.board);
  const simResult = useStore((s) => s.simResult);
  const showParticles = useStore((s) => s.showParticles);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const phases = useRef<Float32Array>(new Float32Array(MAX_PARTICLES));
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Build the segment table whenever the board or solved currents change.
  const { segments, total } = useMemo(() => {
    const segs: Segment[] = [];
    if (!board || !simResult) return { segments: segs, total: 0 };

    // Normalise speed/density against the largest current on the board.
    let maxI = MIN_CURRENT_A;
    for (const t of board.tracks) maxI = Math.max(maxI, netCurrent(board, simResult, t.netId));

    const dirs = trackDirections(board, simResult);
    let budget = MAX_PARTICLES;
    for (const track of board.tracks) {
      const amps = netCurrent(board, simResult, track.netId);
      if (amps < MIN_CURRENT_A || budget <= 0) continue;
      const frac = amps / maxI;                 // 0..1
      const a = toThree(track.start);
      const b = toThree(track.end);
      const count = Math.min(budget, particleCount(frac));
      budget -= count;
      segs.push({
        a, b,
        layer: track.layer,
        size: Math.min(0.9, Math.max(0.28, track.widthMm * 0.85)),
        dir: dirs.get(track) ?? 1,
        speed: particleSpeed(frac),              // units/sec; sqrt keeps slow flows visible
        count,
      });
    }
    const t = segs.reduce((s, seg) => s + seg.count, 0);
    return { segments: segs, total: t };
  }, [board, simResult]);

  // Track the eased explode value so particles stay on their copper layer.
  const explode = useRef(0);
  useExplodeSpring((f) => { explode.current = f; });

  // Flow particles each frame.
  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || total === 0) return;
    const electron = useStore.getState().electronFlow;
    const thickness = board?.thicknessMm ?? 1.6;

    let i = 0;
    for (const seg of segments) {
      const len = seg.a.distanceTo(seg.b);
      const sign = seg.dir * (electron ? -1 : 1);
      const bottom = seg.layer === "B.Cu";
      const z = copperZ(seg.layer, explode.current, thickness) + (bottom ? -LIFT : LIFT);
      for (let p = 0; p < seg.count; p++, i++) {
        // Advance this particle's phase; stagger start phases evenly.
        let ph = phases.current[i] ?? (p / seg.count);
        ph += (sign * seg.speed * delta) / Math.max(len, 0.001);
        ph = ((ph % 1) + 1) % 1;
        phases.current[i] = ph;

        dummy.position.lerpVectors(seg.a, seg.b, ph);
        dummy.position.z = z;
        dummy.scale.setScalar(seg.size);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!showParticles || total === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, Math.max(total, 1)]}
      frustumCulled={false}
    >
      <sphereGeometry args={[0.5, 10, 8]} />
      <meshBasicMaterial
        color={tokens.phosphor}
        blending={THREE.AdditiveBlending}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
