/**
 * focus.ts — what to highlight and what to dim for the thing under the pointer
 * (or, failing that, the selection). The board and the schematic both read
 * this, so a symbol and its part, or a wire and its traces, light up together.
 */
import type { Board } from "../model/board-model";

export type FocusTarget = { kind: "part"; ref: string } | { kind: "net"; netId: string };

export interface Focus {
  /** False when nothing is hovered or selected: nothing dims. */
  active: boolean;
  /** The target itself, and the nets it carries: drawn highlighted. */
  primaryParts: Set<string>;
  primaryNets: Set<string>;
  /** Everything connected to the target: drawn normally. The rest dims. */
  parts: Set<string>;
  nets: Set<string>;
}

const EMPTY: Focus = { active: false, primaryParts: new Set(), primaryNets: new Set(), parts: new Set(), nets: new Set() };

export function focusOf(board: Board | null, target: FocusTarget | null | undefined): Focus {
  if (!board || !target) return EMPTY;
  const parts = new Set<string>();
  const nets = new Set<string>();

  if (target.kind === "part") {
    const part = board.parts.find((p) => p.ref === target.ref);
    if (!part) return EMPTY;
    for (const pad of part.pads) if (pad.netId && pad.netId !== board.groundNetId) nets.add(pad.netId);
    // Ground touches everything; only focus it when it is all the part has.
    if (nets.size === 0) for (const pad of part.pads) if (pad.netId) nets.add(pad.netId);
    parts.add(part.ref);
    for (const p of board.parts) if (p.pads.some((pad) => pad.netId && nets.has(pad.netId))) parts.add(p.ref);
    return { active: true, primaryParts: new Set([part.ref]), primaryNets: new Set(nets), parts, nets };
  }

  if (!board.nets.some((n) => n.id === target.netId)) return EMPTY;
  nets.add(target.netId);
  for (const p of board.parts) if (p.pads.some((pad) => pad.netId === target.netId)) parts.add(p.ref);
  return { active: true, primaryParts: new Set(), primaryNets: new Set([target.netId]), parts, nets };
}

/** Stable string for memo keys, so a new Focus with the same contents doesn't rebuild geometry. */
export function focusKey(f: Focus): string {
  if (!f.active) return "";
  const s = (x: Set<string>) => [...x].sort().join(",");
  return `${s(f.primaryParts)}|${s(f.primaryNets)}|${s(f.parts)}|${s(f.nets)}`;
}
