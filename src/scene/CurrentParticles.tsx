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

const MAX_PARTICLES = 600;          // fps budget
const MIN_CURRENT_A = 1e-5;         // below this a track shows no flow
const PARTICLES_PER_SEGMENT = 6;    // base density, scaled by |I|
const LAYER_Z: Record<string, number> = {
  "F.Cu": 0.08, "B.Cu": -1.62, "In1.Cu": -0.5, "In2.Cu": -1.1,
};

interface Segment {
  a: THREE.Vector3;       // start (three space)
  b: THREE.Vector3;       // end
  dir: number;            // +1 a→b, -1 b→a (conventional current)
  speed: number;          // units/sec along the segment
  count: number;          // particles on this segment
}

/** Board-space Vec2 → three-space position at a track layer's z. */
function toThree(p: Vec2, z: number): THREE.Vector3 {
  return new THREE.Vector3(p.x, -p.y, z);
}

/** Pick a representative |current| for a track's net from the sim result. */
function netCurrent(board: Board, sim: SimResult, netId: string): number {
  let max = 0;
  for (const br of sim.branches) {
    if (br.amps <= max) continue;
    const part = board.parts.find((p) => p.ref === br.ref);
    if (!part) continue;
    const onNet =
      part.pads.some((pad) => (pad.number === br.fromPad || pad.number === br.toPad) && pad.netId === netId);
    if (onNet) max = Math.max(max, br.amps);
  }
  return max;
}

/**
 * Orient a track: conventional current flows from the higher-potential end to
 * the lower. We compare the net voltage at each endpoint's nearest same-net pad.
 * Equipotential nets fall back to +1 (a→b) so flow still reads coherently.
 */
function orient(board: Board, sim: SimResult, track: Track): number {
  // Find a driving part on this net whose current leaves a higher-V pad.
  // Heuristic: use the branch on this net and align to its from→to pad positions.
  for (const br of sim.branches) {
    if (br.amps < MIN_CURRENT_A) continue;
    const part = board.parts.find((p) => p.ref === br.ref);
    if (!part) continue;
    const fromPad = part.pads.find((pd) => pd.number === br.fromPad && pd.netId === track.netId);
    const toPad = part.pads.find((pd) => pd.number === br.toPad && pd.netId === track.netId);
    const anchor = fromPad ?? toPad;
    if (!anchor) continue;
    // Current enters the net at `fromPad` side and leaves at `toPad` side.
    // Orient the track so particles move away from the entering pad.
    const entering = fromPad ? anchor.position : null;
    if (entering) {
      const dA = Math.hypot(entering.x - track.start.x, entering.y - track.start.y);
      const dB = Math.hypot(entering.x - track.end.x, entering.y - track.end.y);
      return dA <= dB ? +1 : -1;
    }
  }
  return +1;
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

    let budget = MAX_PARTICLES;
    for (const track of board.tracks) {
      const amps = netCurrent(board, simResult, track.netId);
      if (amps < MIN_CURRENT_A || budget <= 0) continue;
      const frac = amps / maxI;                 // 0..1
      const z = LAYER_Z[track.layer] ?? 0.08;
      const a = toThree(track.start, z);
      const b = toThree(track.end, z);
      const count = Math.min(budget, Math.max(1, Math.round(PARTICLES_PER_SEGMENT * frac)));
      budget -= count;
      segs.push({
        a, b,
        dir: orient(board, simResult, track),
        speed: 6 + 26 * Math.sqrt(frac),        // units/sec; sqrt keeps slow flows visible
        count,
      });
    }
    const t = segs.reduce((s, seg) => s + seg.count, 0);
    return { segments: segs, total: t };
  }, [board, simResult]);

  // Flow particles each frame.
  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || total === 0) return;
    const electron = useStore.getState().electronFlow;

    let i = 0;
    for (const seg of segments) {
      const len = seg.a.distanceTo(seg.b);
      const sign = seg.dir * (electron ? -1 : 1);
      for (let p = 0; p < seg.count; p++, i++) {
        // Advance this particle's phase; stagger start phases evenly.
        let ph = phases.current[i] ?? (p / seg.count);
        ph += (sign * seg.speed * delta) / Math.max(len, 0.001);
        ph = ((ph % 1) + 1) % 1;
        phases.current[i] = ph;

        dummy.position.lerpVectors(seg.a, seg.b, ph);
        dummy.scale.setScalar(0.6);
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
      <sphereGeometry args={[0.45, 8, 8]} />
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
