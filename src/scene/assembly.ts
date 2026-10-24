/**
 * assembly.ts — the pick-and-place build sequence for the assembly demo.
 *
 * Parts go down in the order a real line places them: small SMD passives
 * first, then LEDs and actives, then fine-pitch ICs, then through-hole parts
 * (hand-load / wave). Within each pass the machine sweeps left to right.
 * The schedule is pure; the scene reads it each frame.
 */
import { create } from "zustand";
import * as THREE from "three";
import type { Board, Part } from "../model/board-model";
import { packageFamily, type PackageFamily } from "./footprint";

/** Boards that always build themselves when loaded; `?assemble` forces any board. */
const ASSEMBLE_ON_LOAD = new Set(["robot-controller-board"]);

const PASS: Record<PackageFamily, number> = {
  "chip-resistor": 0,
  "chip-capacitor": 0,
  "chip-fuse": 1,
  "chip-led": 1,
  sot23: 2,
  qfp: 3,
  generic: 3,
  trimpot: 4,
  "pin-header": 4,
  "radial-cap": 5,
  xt30: 5,
};

/** Seconds the head spends on one part: travel, descend, release. */
const STEP_S: Record<number, number> = { 0: 0.22, 1: 0.3, 2: 0.4, 3: 1.1, 4: 0.6, 5: 0.75 };
const LEAD_IN_S = 0.9;
export const DROP_S = 0.32;
export const HOVER_MM = 16;

export interface Placement {
  ref: string;
  /** Seconds after the start when the part begins dropping. */
  at: number;
}

export function assemblyOrder(parts: Part[]): Part[] {
  return [...parts].sort((a, b) => {
    const pa = PASS[packageFamily(a)], pb = PASS[packageFamily(b)];
    if (pa !== pb) return pa - pb;
    // Serpentine sweep in 10 mm bands, like a gantry working row by row.
    const ba = Math.floor(a.position.y / 10), bb = Math.floor(b.position.y / 10);
    if (ba !== bb) return ba - bb;
    return ba % 2 === 0 ? a.position.x - b.position.x : b.position.x - a.position.x;
  });
}

export function schedule(parts: Part[]): { placements: Map<string, Placement>; duration: number } {
  const placements = new Map<string, Placement>();
  let t = LEAD_IN_S;
  for (const p of assemblyOrder(parts)) {
    placements.set(p.ref, { ref: p.ref, at: t });
    t += STEP_S[PASS[packageFamily(p)]] ?? 0.4;
  }
  return { placements, duration: t + DROP_S };
}

export function shouldAssemble(board: Board): boolean {
  const forced = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("assemble");
  return forced || ASSEMBLE_ON_LOAD.has(board.id);
}

interface AssemblyState {
  boardId: string | null;
  /** performance.now() / 1000 at the start, or null when nothing is building. */
  startedAt: number | null;
  placements: Map<string, Placement>;
  duration: number;
  /** Board id that has finished building and been powered on (drives the LED chase). */
  poweredBoardId: string | null;
  start: (board: Board) => void;
  finish: () => void;
  powerOn: (boardId: string) => void;
}

export const useAssembly = create<AssemblyState>((set) => ({
  boardId: null,
  startedAt: null,
  placements: new Map(),
  duration: 0,
  poweredBoardId: null,
  start: (board) => {
    const { placements, duration } = schedule(board.parts);
    set({ boardId: board.id, startedAt: performance.now() / 1000, placements, duration, poweredBoardId: null });
  },
  finish: () => set({ startedAt: null }),
  powerOn: (boardId) => set({ poweredBoardId: boardId }),
}));

/** Where the nozzle tip is this frame (three space); PlacementHead writes it, the camera follows it. */
export const headPosition = new THREE.Vector3();

/** Ease-out with a small settle, for a part landing in wet paste. */
export function landing(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}
