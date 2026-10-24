/**
 * execute.ts — pure, synchronous execution of Arduino-style user code.
 *
 * No Workers, no SharedArrayBuffer, no Atomics.  This function runs the user code
 * against an McuApi, calls solve() directly whenever analogRead / digitalRead
 * needs a voltage, and returns the accumulated state.
 *
 * Every API call is also recorded as a TraceEvent tagged with the source line
 * that made it, so the IDE can replay a run step by step. Line tracking works by
 * instrumenting the sketch with acorn: `__cx_at(line);` is inserted before every
 * statement in a statement list.
 *
 * It is deliberately environment-agnostic: it runs identically on the main
 * thread, in a browser module Worker, or in a Node worker_thread.
 */

import { parse } from "acorn";
import type { Board, McuState, SimResult } from "../model/board-model";
import { solve } from "../solver/solve";

export type TraceEvent =
  | { kind: "pinMode"; line: number; pin: string; mode: "input" | "output" }
  | { kind: "digitalWrite"; line: number; pin: string; level: 0 | 1 }
  | { kind: "digitalRead"; line: number; pin: string; value: 0 | 1 }
  | { kind: "analogRead"; line: number; pin: string; value: number }
  | { kind: "log"; line: number; text: string };

export interface ExecuteResult {
  mcuState: McuState;
  logs: unknown[];
  trace: TraceEvent[];
  traceTruncated: boolean;
  error?: string;
  /** Line that was executing when the sketch threw, if known. */
  errorLine?: number;
}

/** Hard cap so an endless loop of pin calls cannot exhaust memory before the timeout. */
export const MAX_TRACE_EVENTS = 5000;

/** Resolve a pin argument (number or string) to the canonical pin name, e.g. "D8". */
export function resolvePin(pin: string | number, board: Board): string | null {
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

/**
 * Apply one trace event to an MCU state. This is the single place pin state
 * changes, used both while executing and while replaying a trace, so a replay
 * always reproduces exactly what the run did. Reads and logs change nothing.
 */
export function applyTraceEvent(state: McuState, event: TraceEvent): McuState {
  switch (event.kind) {
    case "pinMode":
      return { modes: { ...state.modes, [event.pin]: event.mode }, outputs: state.outputs };
    case "digitalWrite":
      return {
        modes: { ...state.modes, [event.pin]: "output" },
        outputs: { ...state.outputs, [event.pin]: event.level },
      };
    case "digitalRead":
    case "analogRead":
    case "log":
      return state;
  }
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

interface AstNode {
  type: string;
  start: number;
  loc?: { start: { line: number } };
  [key: string]: unknown;
}

function isNode(value: unknown): value is AstNode {
  return typeof value === "object" && value !== null && typeof (value as AstNode).type === "string";
}

/**
 * Insert `__cx_at(line);` before every statement in a statement list so the
 * runtime always knows which source line is executing. Throws acorn's
 * SyntaxError for code that does not parse.
 */
export function instrumentSketch(code: string): string {
  const ast = parse(code, { ecmaVersion: "latest", sourceType: "script", locations: true });
  const inserts: { at: number; line: number }[] = [];

  const visit = (node: AstNode): void => {
    const lists: unknown[] = [];
    if (node.type === "Program" || node.type === "BlockStatement" || node.type === "StaticBlock") {
      lists.push(node["body"]);
    }
    if (node.type === "SwitchCase") lists.push(node["consequent"]);
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const stmt of list) {
        if (isNode(stmt) && stmt.loc) inserts.push({ at: stmt.start, line: stmt.loc.start.line });
      }
    }
    for (const key of Object.keys(node)) {
      if (key === "loc") continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const c of child) if (isNode(c)) visit(c);
      } else if (isNode(child)) {
        visit(child);
      }
    }
  };
  visit(ast as unknown as AstNode);

  // Splice from the end so earlier offsets stay valid.
  inserts.sort((a, b) => b.at - a.at);
  let out = code;
  for (const { at, line } of inserts) {
    out = `${out.slice(0, at)}__cx_at(${line});${out.slice(at)}`;
  }
  return out;
}

/**
 * Run `code` against the board, starting from `initialMcuState`.
 * Returns the resulting McuState, collected logs, the trace, and an error
 * message if the user code threw.  Never throws for user errors.
 */
export function executeProgram(
  code: string,
  board: Board,
  initialMcuState: McuState,
): ExecuteResult {
  // Mutable working state (copied so callers keep their snapshot).
  let mcuState: McuState = {
    modes: { ...initialMcuState.modes },
    outputs: { ...initialMcuState.outputs },
  };
  const logs: unknown[] = [];
  const trace: TraceEvent[] = [];
  let traceTruncated = false;
  let currentLine = 1;

  const record = (event: TraceEvent): void => {
    mcuState = applyTraceEvent(mcuState, event);
    if (trace.length < MAX_TRACE_EVENTS) trace.push(event);
    else traceTruncated = true;
  };

  const requirePin = (pin: string | number): string => {
    const name = resolvePin(pin, board);
    if (!name) throw new Error(`Unknown pin ${pin}: does not exist on this board.`);
    return name;
  };

  // ── Arduino-flavoured API ──────────────────────────────────────────────────
  function pinMode(pin: string | number, mode: "INPUT" | "OUTPUT"): void {
    const name = requirePin(pin);
    record({ kind: "pinMode", line: currentLine, pin: name, mode: mode === "OUTPUT" ? "output" : "input" });
  }

  function digitalWrite(pin: string | number, level: 0 | 1 | "HIGH" | "LOW"): void {
    const name = requirePin(pin);
    record({ kind: "digitalWrite", line: currentLine, pin: name, level: normalizeLevel(level) });
  }

  function digitalRead(pin: string | number): 0 | 1 {
    const name = requirePin(pin);
    const value = digitalValue(name, board, solve(board, mcuState));
    record({ kind: "digitalRead", line: currentLine, pin: name, value });
    return value;
  }

  function analogRead(pin: string | number): number {
    const name = requirePin(pin);
    // Solve directly — no cross-thread hop needed.
    const value = adcValue(name, board, solve(board, mcuState));
    record({ kind: "analogRead", line: currentLine, pin: name, value });
    return value;
  }

  function log(...args: unknown[]): void {
    const text = args.map((a) => String(a)).join(" ");
    logs.push(text);
    record({ kind: "log", line: currentLine, text });
  }

  const at = (line: number): void => { currentLine = line; };

  const HIGH = 1;
  const LOW = 0;

  const fail = (e: unknown): ExecuteResult => ({
    mcuState,
    logs,
    trace,
    traceTruncated,
    error: e instanceof Error ? e.message : String(e),
    errorLine: currentLine,
  });

  let instrumented: string;
  try {
    instrumented = instrumentSketch(code);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { mcuState, logs, trace, traceTruncated, error: `Syntax error: ${message}` };
  }

  // ── Run the user code in a Function sandbox ──────────────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const fn = new Function(
      "pinMode", "digitalWrite", "digitalRead", "analogRead", "log", "HIGH", "LOW", "__cx_at",
      `"use strict";\n${instrumented}`,
    );
    fn(pinMode, digitalWrite, digitalRead, analogRead, log, HIGH, LOW, at);
    return { mcuState, logs, trace, traceTruncated };
  } catch (e: unknown) {
    return fail(e);
  }
}
