/**
 * InspectorPanel — right-side overlay providing:
 *   • data-testid="inspector-current-<REF>" for every part (always in DOM)
 *   • data-testid="code-editor"  — Arduino-style textarea
 *   • data-testid="run-button"   — executes the code against the solver
 *
 * All inspector-current-* spans are always mounted so Playwright can poll them
 * immediately after clicking Run, regardless of which part is selected.
 * When a part is selected its current row is styled prominently; others are
 * rendered in a visually-hidden block so they don't clutter the UI.
 */
import React, { useCallback, useState } from "react";
import { useStore } from "../store/useStore";
import type { Board, McuState, SimResult } from "../model/board-model";
import { solve } from "../solver/solve";

// ─── formatting ───────────────────────────────────────────────────────────────

function fmtMilliAmps(amps: number): string {
  // 3 significant figures, e.g. "12.2 mA"
  return `${(amps * 1000).toPrecision(3)} mA`;
}

function branchAmps(simResult: SimResult | null, ref: string): number | null {
  if (!simResult) return null;
  const b = simResult.branches.find((br) => br.ref === ref);
  return b?.amps ?? null;
}

// ─── code execution ───────────────────────────────────────────────────────────

function normalizePin(pin: string | number, board: Board): string | null {
  const s = String(pin).toUpperCase();
  for (const part of board.parts) {
    if (!part.model || part.model.type !== "mcu") continue;
    for (const mcuPin of part.model.pins) {
      if (mcuPin.name.toUpperCase() === s) return mcuPin.name;
      // Accept bare number: "8" matches "D8"
      if (mcuPin.name.replace(/^[A-Z]+/i, "") === s) return mcuPin.name;
    }
  }
  return null;
}

function normalizeLevel(level: unknown): 0 | 1 {
  if (level === 1 || level === "HIGH" || level === "high") return 1;
  return 0;
}

interface RunResult {
  mcuState: McuState;
  simResult: SimResult;
  error?: string;
}

function runCode(code: string, board: Board, prevMcuState: McuState): RunResult {
  const snap: McuState = {
    modes: { ...prevMcuState.modes },
    outputs: { ...prevMcuState.outputs },
  };
  const mcuState: McuState = {
    modes: { ...prevMcuState.modes },
    outputs: { ...prevMcuState.outputs },
  };

  const pinErrors: string[] = [];

  function pinMode(pin: string | number, mode: "INPUT" | "OUTPUT"): void {
    const name = normalizePin(pin, board);
    if (!name) { pinErrors.push(`Unknown pin ${pin}: does not exist on this board.`); return; }
    mcuState.modes[name] = mode === "OUTPUT" ? "output" : "input";
  }

  function digitalWrite(pin: string | number, level: unknown): void {
    const name = normalizePin(pin, board);
    if (!name) { pinErrors.push(`Unknown pin ${pin}: does not exist on this board.`); return; }
    mcuState.modes[name] = "output";
    mcuState.outputs[name] = normalizeLevel(level);
  }

  function digitalRead(pin: string | number): 0 | 1 {
    const name = normalizePin(pin, board);
    if (!name) { pinErrors.push(`Unknown pin ${pin}: does not exist on this board.`); return 0; }
    // Solve inline to get live voltage; threshold at Vcc/2.
    const sr = solve(board, mcuState);
    for (const part of board.parts) {
      if (!part.model || part.model.type !== "mcu") continue;
      const mcuPin = part.model.pins.find((p) => p.name === name);
      if (!mcuPin) continue;
      const pad = part.pads.find((p) => p.number === mcuPin.pad);
      if (!pad?.netId) continue;
      const v = sr.netVoltages[pad.netId] ?? 0;
      return v >= part.model.vcc / 2 ? 1 : 0;
    }
    return 0;
  }

  function analogRead(pin: string | number): number {
    const name = normalizePin(pin, board);
    if (!name) { pinErrors.push(`Unknown pin ${pin}: does not exist on this board.`); return 0; }
    const sr = solve(board, mcuState);
    for (const part of board.parts) {
      if (!part.model || part.model.type !== "mcu") continue;
      const mcuPin = part.model.pins.find((p) => p.name === name);
      if (!mcuPin) continue;
      const pad = part.pads.find((p) => p.number === mcuPin.pad);
      if (!pad?.netId) continue;
      const v = sr.netVoltages[pad.netId] ?? 0;
      const maxVal = (1 << part.model.adcBits) - 1;
      return Math.round(Math.max(0, Math.min(1, v / part.model.vcc)) * maxVal);
    }
    return 0;
  }

  function log(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.log("[MCU]", ...args);
  }

  const HIGH = 1;
  const LOW = 0;

  const deadline = Date.now() + 500;
  function __check(): void {
    if (Date.now() > deadline) throw new Error("Execution timed out — possible infinite loop.");
  }

  // Instrument loops so the timeout can fire.
  const instrumented = code
    .replace(/\bwhile\s*\(/g, "while (__check(),")
    .replace(/\bfor\s*\(/g, "for (__check(),");

  const sandbox = { pinMode, digitalWrite, digitalRead, analogRead, log, HIGH, LOW, __check };

  let thrownError: string | undefined;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...Object.keys(sandbox), `"use strict";\n${instrumented}`);
    fn(...Object.values(sandbox));
  } catch (e: unknown) {
    thrownError = e instanceof Error ? e.message : String(e);
    return { mcuState: snap, simResult: solve(board, snap), error: thrownError };
  }

  if (pinErrors.length > 0) {
    return { mcuState: snap, simResult: solve(board, snap), error: pinErrors.join("; ") };
  }

  return { mcuState, simResult: solve(board, mcuState) };
}

// ─── styles (no raw hex in component — use design tokens via CSS vars later) ──

const panel: React.CSSProperties = {
  position: "absolute",
  bottom: "1rem",
  right: "1rem",
  width: "22rem",
  maxHeight: "80vh",
  overflowY: "auto",
  background: "#0d1117",
  border: "1px solid #243224",
  borderRadius: "3px",
  fontFamily: "monospace",
  fontSize: "0.8rem",
  color: "#c8d8c8",
  display: "flex",
  flexDirection: "column",
};

const section: React.CSSProperties = {
  borderBottom: "1px solid #1a2a1a",
  padding: "0.6rem 0.8rem",
};

const sectionLabel: React.CSSProperties = {
  color: "#5a7a5a",
  fontSize: "0.68rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: "0.3rem",
};

// ─── component ────────────────────────────────────────────────────────────────

export default function InspectorPanel(): React.ReactElement {
  const board = useStore((s) => s.board);
  const selection = useStore((s) => s.selection);
  const simResult = useStore((s) => s.simResult);
  const mcuState = useStore((s) => s.mcuState);
  const setMcuState = useStore((s) => s.setMcuState);
  const setSimResult = useStore((s) => s.setSimResult);

  const [code, setCode] = useState("// Arduino-style code\ndigitalWrite(8, HIGH);");
  const [runError, setRunError] = useState<string | null>(null);

  const selectedPart =
    selection?.kind === "part"
      ? (board?.parts.find((p) => p.ref === selection.ref) ?? null)
      : null;

  const handleRun = useCallback(() => {
    if (!board) return;
    setRunError(null);
    const result = runCode(code, board, mcuState);
    setMcuState(result.mcuState);
    setSimResult(result.simResult);
    if (result.error) setRunError(result.error);
  }, [board, code, mcuState, setMcuState, setSimResult]);

  return (
    <div style={panel}>

      {/* ── Selected part summary ── */}
      {selectedPart && (
        <div style={section}>
          <div style={sectionLabel}>Selected</div>
          <div style={{ fontWeight: "bold", color: "#7ec8a0" }}>
            {selectedPart.ref}
            <span style={{ fontWeight: "normal", color: "#8a9a8a", marginLeft: "0.4rem" }}>
              {selectedPart.value}
            </span>
          </div>
          {selectedPart.blurb && (
            <div style={{ color: "#7a8a7a", marginTop: "0.25rem", fontSize: "0.75rem" }}>
              {selectedPart.blurb}
            </div>
          )}
        </div>
      )}

      {/* ── Branch currents — always rendered, highlighted for selected part ──
           All inspector-current-<REF> spans live here so Playwright can always
           find them, even when a different part is selected.               */}
      {board && simResult && (
        <div style={section}>
          <div style={sectionLabel}>Branch currents</div>
          {board.parts.map((part) => {
            const amps = branchAmps(simResult, part.ref);
            const isSelected = selectedPart?.ref === part.ref;
            const hasValue = amps !== null;
            return (
              <div
                key={part.ref}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0.1rem 0",
                  opacity: isSelected || !selectedPart ? 1 : 0.45,
                }}
              >
                <span style={{ color: isSelected ? "#7ec8a0" : "#5a7a5a" }}>
                  {part.ref}
                </span>
                <span
                  data-testid={`inspector-current-${part.ref}`}
                  style={{
                    color: isSelected ? "#7ec8a0" : "#8a9a8a",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {hasValue ? fmtMilliAmps(amps!) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Code editor ── */}
      <div style={section}>
        <div style={sectionLabel}>Code</div>
        <textarea
          data-testid="code-editor"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          rows={4}
          spellCheck={false}
          style={{
            width: "100%",
            background: "#08100a",
            border: "1px solid #1a2a1a",
            borderRadius: "2px",
            color: "#c8d8c8",
            fontFamily: "monospace",
            fontSize: "0.78rem",
            padding: "0.4rem",
            resize: "vertical",
            boxSizing: "border-box",
            outline: "none",
          }}
        />
        {runError && (
          <div
            role="alert"
            style={{ color: "#cc4444", marginTop: "0.3rem", fontSize: "0.73rem" }}
          >
            {runError}
          </div>
        )}
      </div>

      {/* ── Run button ── */}
      <div style={{ padding: "0.5rem 0.8rem 0.7rem" }}>
        <button
          data-testid="run-button"
          onClick={handleRun}
          disabled={!board}
          style={{
            width: "100%",
            background: board ? "#0e2a0e" : "#0a180a",
            border: `1px solid ${board ? "#2a6a2a" : "#1a3a1a"}`,
            borderRadius: "2px",
            color: board ? "#7ec8a0" : "#3a5a3a",
            fontFamily: "monospace",
            fontSize: "0.8rem",
            padding: "0.35rem 0",
            cursor: board ? "pointer" : "not-allowed",
          }}
        >
          Run
        </button>
      </div>
    </div>
  );
}
