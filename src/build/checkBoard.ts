/**
 * checkBoard — electrical rules check (ERC). Looks at how the board is wired,
 * without solving it, and reports mistakes a developer would want flagged
 * before trusting the simulation: floating pads, no supply, no ground, a supply
 * shorted to itself, an unpowered MCU, nets that go nowhere, overlapping parts.
 */
import type { Board, Part } from "../model/board-model";
import type { Problem } from "./problems";

export interface CheckBoardOptions {
  /** Flag parts whose bodies overlap (useful while building; off for fab boards). */
  overlap?: boolean;
}

function padLabel(part: Part, pad: string): string {
  return `${part.ref} pad ${pad}`;
}

function bodyBox(part: Part): { x0: number; y0: number; x1: number; y1: number } {
  const quarter = Math.round(part.rotationDeg / 90) % 2 !== 0;
  const w = quarter ? part.body.h : part.body.w;
  const h = quarter ? part.body.w : part.body.h;
  return { x0: part.position.x - w / 2, y0: part.position.y - h / 2, x1: part.position.x + w / 2, y1: part.position.y + h / 2 };
}

export function checkBoard(board: Board, options: CheckBoardOptions = {}): Problem[] {
  const problems: Problem[] = [];
  let seq = 0;
  const add = (p: Omit<Problem, "id" | "source">): void => {
    problems.push({ id: `board-${seq++}`, source: "board", ...p });
  };

  if (board.simulation === "reference") {
    add({ severity: "info", message: "Official PCB layout reference. Voltages and motor behavior need a circuit model and are not simulated here." });
    return problems;
  }

  if (board.parts.length === 0) {
    add({ severity: "info", message: "This board is empty. Open Build PCB to place parts." });
    return problems;
  }

  const supplies = board.parts.filter((p) => p.model?.type === "vsource");
  if (supplies.length === 0) {
    add({ severity: "error", message: "No power source. Add a supply (J) and wire its + and − terminals." });
  }

  for (const supply of supplies) {
    if (supply.model?.type !== "vsource") continue;
    const { posPad, negPad } = supply.model;
    const pos = supply.pads.find((p) => p.number === posPad)?.netId ?? null;
    const neg = supply.pads.find((p) => p.number === negPad)?.netId ?? null;
    if (pos !== null && pos === neg) {
      add({ severity: "error", ref: supply.ref, message: `${supply.ref} is shorted: its + and − terminals are on the same net (${pos}).` });
    }
  }

  const groundUsed = board.parts.some((p) => p.pads.some((pad) => pad.netId === board.groundNetId));
  if (!groundUsed && supplies.length > 0) {
    add({ severity: "error", message: `Nothing is connected to ground (${board.groundNetId}). Wire the supply's − terminal to the circuit.` });
  }

  for (const part of board.parts) {
    if (!part.model) continue;
    if (part.model.type === "mcu") {
      const { vccPad, gndPad } = part.model;
      for (const [pad, role] of [[vccPad, "power"], [gndPad, "ground"]] as const) {
        const net = part.pads.find((p) => p.number === pad)?.netId ?? null;
        if (net === null) {
          add({ severity: "error", ref: part.ref, message: `${part.ref} has no ${role}: ${padLabel(part, pad)} isn't connected, so its pins can't drive anything.` });
        }
      }
      // Unwired GPIO pins are normal on an MCU; only power pins are required.
      continue;
    }
    for (const pad of part.pads) {
      if (pad.netId === null) {
        add({ severity: "warning", ref: part.ref, message: `${padLabel(part, pad.number)} isn't connected to anything.` });
      }
    }
  }

  // Nets that reach only one pad go nowhere.
  const padCount = new Map<string, { count: number; first: string; ref: string }>();
  for (const part of board.parts) {
    for (const pad of part.pads) {
      if (pad.netId === null) continue;
      const entry = padCount.get(pad.netId);
      if (entry) entry.count += 1;
      else padCount.set(pad.netId, { count: 1, first: padLabel(part, pad.number), ref: part.ref });
    }
  }
  for (const [netId, { count, first, ref }] of padCount) {
    if (count === 1 && netId !== board.groundNetId) {
      add({ severity: "warning", ref, netId, message: `Net ${netId} only reaches ${first}; it doesn't go anywhere.` });
    }
  }

  if (options.overlap) {
    const boxes = board.parts.map((p) => ({ ref: p.ref, box: bodyBox(p) }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!.box;
        const b = boxes[j]!.box;
        if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) {
          add({ severity: "warning", ref: boxes[j]!.ref, message: `${boxes[i]!.ref} and ${boxes[j]!.ref} overlap. Move one of them.` });
        }
      }
    }
  }

  return problems;
}
