/**
 * execute.ts — pure, synchronous execution of Arduino-style user code.
 *
 * No Workers, no SharedArrayBuffer, no Atomics.  This function runs the user code
 * against an McuApi, calls solve() directly whenever analogRead / digitalRead
 * needs a voltage, and returns the accumulated state.
 *
 * It is deliberately environment-agnostic: it runs identically on the main
 * thread, in a browser module Worker, or in a Node worker_thread.  The only
 * dependency is the solver and the board-model types.
 */

import type { Board, McuState, SimResult } from "../model/board-model";
import { solve } from "../solver/solve";

export interface ExecuteResult {
  mcuState: McuState;
  logs: unknown[];
  error?: string;
}

/** Resolve a pin argument (number or string) to the canonical pin name, e.g. "D8". */
function resolvePin(pin: string | number, board: Board): string | null {
  const key = String(pin).toUpperCase();
  for (const part of board.parts) {
    if (!part.model || part.model.type !== "mcu") continue;
    for (const mcuPin of part.model.pins) {
      if (mcuPin.name.toUpperCase() === key) return mcuPin.name;       // "D8" / "A0"
      if (mcuPin.name.replace(/^[A-Za-z]+/, "") === key) return mcuPin.name; // "8" → "D8"
    }
  }
  return null;
}

/** Normalise a digital level argument to 0 or 1. */
function normalizeLevel(level: unknown): 0 | 1 {
  if (level === 1 || level === "HIGH" || level === "high") return 1;
  return 0;
}

/** Compute the ADC reading for a pin from a solved result. */
function adcValue(pin: string, board: Board, sim: SimResult): number {
  for (const part of board.parts) {
    if (!part.model || part.model.type !== "mcu") continue;
    const mcuPin = part.model.pins.find((p) => p.name === pin);
    if (!mcuPin) continue;
    const pad = part.pads.find((p) => p.number === mcuPin.pad);
    if (!pad?.netId) continue;
    const v = sim.netVoltages[pad.netId] ?? 0;
    const maxVal = (1 << part.model.adcBits) - 1;
    return Math.round(Math.max(0, Math.min(1, v / part.model.vcc)) * maxVal);
  }
  return 0;
}

/** Digital threshold reading for a pin from a solved result. */
function digitalValue(pin: string, board: Board, sim: SimResult): 0 | 1 {
  for (const part of board.parts) {
    if (!part.model || part.model.type !== "mcu") continue;
    const mcuPin = part.model.pins.find((p) => p.name === pin);
    if (!mcuPin) continue;
    const pad = part.pads.find((p) => p.number === mcuPin.pad);
    if (!pad?.netId) continue;
    const v = sim.netVoltages[pad.netId] ?? 0;
    return v >= part.model.vcc / 2 ? 1 : 0;
  }
  return 0;
}

/**
 * Run `code` against the board, starting from `initialMcuState`.
 * Returns the resulting McuState, collected logs, and an error message if the
 * user code threw.  Never throws for user errors — they surface in `error`.
 */
export function executeProgram(
  code: string,
  board: Board,
  initialMcuState: McuState,
): ExecuteResult {
  // Mutable working state (copied so callers keep their snapshot).
  const mcuState: McuState = {
    modes: { ...initialMcuState.modes },
    outputs: { ...initialMcuState.outputs },
  };
  const logs: unknown[] = [];

  // ── Arduino-flavoured API ──────────────────────────────────────────────────
  function pinMode(pin: string | number, mode: "INPUT" | "OUTPUT"): void {
    const name = resolvePin(pin, board);
    if (!name) throw new Error(`Unknown pin ${pin}: does not exist on this board.`);
    mcuState.modes[name] = mode === "OUTPUT" ? "output" : "input";
  }

  function digitalWrite(pin: string | number, level: 0 | 1 | "HIGH" | "LOW"): void {
    const name = resolvePin(pin, board);
    if (!name) throw new Error(`Unknown pin ${pin}: does not exist on this board.`);
    mcuState.modes[name] = "output";
    mcuState.outputs[name] = normalizeLevel(level);
  }

  function digitalRead(pin: string | number): 0 | 1 {
    const name = resolvePin(pin, board);
    if (!name) throw new Error(`Unknown pin ${pin}: does not exist on this board.`);
    return digitalValue(name, board, solve(board, mcuState));
  }

  function analogRead(pin: string | number): number {
    const name = resolvePin(pin, board);
    if (!name) throw new Error(`Unknown pin ${pin}: does not exist on this board.`);
    // Solve directly — no cross-thread hop needed.
    return adcValue(name, board, solve(board, mcuState));
  }

  function log(...args: unknown[]): void {
    logs.push(args.map((a) => String(a)).join(" "));
  }

  const HIGH = 1;
  const LOW = 0;

  // ── Run the user code in a Function sandbox ──────────────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const fn = new Function(
      "pinMode", "digitalWrite", "digitalRead", "analogRead", "log", "HIGH", "LOW",
      `"use strict";\n${code}`,
    );
    fn(pinMode, digitalWrite, digitalRead, analogRead, log, HIGH, LOW);
    return { mcuState, logs };
  } catch (e: unknown) {
    return {
      mcuState,
      logs,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
