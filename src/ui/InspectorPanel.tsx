/**
 * InspectorPanel — right-side overlay. It is the only place user code runs, and
 * it runs exclusively through the worker runtime (createRuntime(board).run()).
 *
 * Responsibilities:
 *   • Parts list with data-testid="part-<REF>" entries (click to select).
 *   • data-testid="code-editor"  — Arduino-style textarea.
 *   • data-testid="run-button"   — runs the code via the runtime worker.
 *   • data-testid="inspector-current-<REF>" — live branch current per part.
 *   • Shows logs and the friendly error message from a timeout / thrown error.
 *
 * On error or timeout the store's mcuState / simResult are left unchanged
 * (the runtime returns the pre-run snapshot), so the 3D scene does not change.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import type { Board, SimResult } from "../model/board-model";
import { createRuntime, type Runtime } from "../runtime/runtime";

// ─── formatting ───────────────────────────────────────────────────────────────

function fmtMilliAmps(amps: number): string {
  return `${(amps * 1000).toPrecision(3)} mA`;
}

function branchAmps(simResult: SimResult | null, ref: string): number | null {
  if (!simResult) return null;
  const b = simResult.branches.find((br) => br.ref === ref);
  return b?.amps ?? null;
}

// ─── styles ──────────────────────────────────────────────────────────────────

const panel: React.CSSProperties = {
  position: "absolute",
  top: "1rem",
  right: "1rem",
  bottom: "1rem",
  width: "23rem",
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
  marginBottom: "0.35rem",
};

// ─── component ────────────────────────────────────────────────────────────────

export default function InspectorPanel(): React.ReactElement {
  const board = useStore((s) => s.board);
  const selection = useStore((s) => s.selection);
  const simResult = useStore((s) => s.simResult);
  const logs = useStore((s) => s.logs);
  const runError = useStore((s) => s.runError);
  const running = useStore((s) => s.running);
  const setSelection = useStore((s) => s.setSelection);
  const setMcuState = useStore((s) => s.setMcuState);
  const setSimResult = useStore((s) => s.setSimResult);
  const setLogs = useStore((s) => s.setLogs);
  const setRunError = useStore((s) => s.setRunError);
  const setRunning = useStore((s) => s.setRunning);

  const [code, setCode] = useState("// Arduino-style code\ndigitalWrite(8, HIGH);");

  // Create the runtime once per board and keep it for the panel's lifetime.
  const runtimeRef = useRef<Runtime | null>(null);
  useEffect(() => {
    runtimeRef.current = board ? createRuntime(board) : null;
  }, [board]);

  const selectedPart =
    selection?.kind === "part"
      ? (board?.parts.find((p) => p.ref === selection.ref) ?? null)
      : null;

  const handleRun = useCallback(async () => {
    const runtime = runtimeRef.current;
    if (!board || !runtime || running) return;

    setRunning(true);
    setRunError(null);
    try {
      const result = await runtime.run(code);
      // On a thrown error or timeout the runtime returns the pre-run snapshot,
      // so writing it back leaves the scene unchanged.
      setMcuState(result.mcuState);
      setSimResult(result.simResult);
      setLogs(result.logs);
      setRunError(result.error ?? null);
    } catch (e: unknown) {
      // Defensive: the runtime resolves rather than rejects, but never swallow.
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [board, code, running, setMcuState, setSimResult, setLogs, setRunError, setRunning]);

  const logLines = useMemo(() => logs.map((l) => String(l)), [logs]);

  return (
    <div style={panel}>

      {/* ── Parts list — one data-testid="part-<REF>" per part ── */}
      {board && (
        <div style={section}>
          <div style={sectionLabel}>Parts</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
            {board.parts.map((part) => {
              const isSelected = selectedPart?.ref === part.ref;
              return (
                <button
                  key={part.ref}
                  data-testid={`part-${part.ref}`}
                  aria-label={`Select ${part.ref} (${part.value})`}
                  aria-pressed={isSelected}
                  onClick={() => setSelection({ kind: "part", ref: part.ref })}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    width: "100%",
                    textAlign: "left",
                    background: isSelected ? "#12331a" : "transparent",
                    border: "1px solid",
                    borderColor: isSelected ? "#2a6a2a" : "transparent",
                    borderRadius: "2px",
                    color: isSelected ? "#7ec8a0" : "#aac0aa",
                    fontFamily: "monospace",
                    fontSize: "0.78rem",
                    padding: "0.2rem 0.4rem",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontWeight: isSelected ? "bold" : "normal" }}>{part.ref}</span>
                  <span style={{ color: "#6a7a6a" }}>{part.value}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

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

      {/* ── Branch currents — always rendered so inspector-current-<REF> exists ── */}
      {board && (
        <div style={section}>
          <div style={sectionLabel}>Branch currents</div>
          {board.parts.map((part) => {
            const amps = branchAmps(simResult, part.ref);
            const isSelected = selectedPart?.ref === part.ref;
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
                <span style={{ color: isSelected ? "#7ec8a0" : "#5a7a5a" }}>{part.ref}</span>
                <span
                  data-testid={`inspector-current-${part.ref}`}
                  style={{
                    color: isSelected ? "#7ec8a0" : "#8a9a8a",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {amps !== null ? fmtMilliAmps(amps) : "—"}
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
      </div>

      {/* ── Run button ── */}
      <div style={{ padding: "0.5rem 0.8rem" }}>
        <button
          data-testid="run-button"
          onClick={() => void handleRun()}
          disabled={!board || running}
          style={{
            width: "100%",
            background: board && !running ? "#0e2a0e" : "#0a180a",
            border: `1px solid ${board && !running ? "#2a6a2a" : "#1a3a1a"}`,
            borderRadius: "2px",
            color: board && !running ? "#7ec8a0" : "#3a5a3a",
            fontFamily: "monospace",
            fontSize: "0.8rem",
            padding: "0.35rem 0",
            cursor: board && !running ? "pointer" : "not-allowed",
          }}
        >
          {running ? "Running…" : "Run"}
        </button>
      </div>

      {/* ── Error (friendly message) ── */}
      {runError && (
        <div
          data-testid="run-error"
          role="alert"
          style={{
            ...section,
            borderBottom: "none",
            color: "#e0923a",
            background: "#1c1206",
          }}
        >
          <div style={{ ...sectionLabel, color: "#a06a2a" }}>Error</div>
          {runError}
        </div>
      )}

      {/* ── Logs ── */}
      {logLines.length > 0 && (
        <div style={{ ...section, borderBottom: "none" }} data-testid="run-logs">
          <div style={sectionLabel}>Log</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
            {logLines.map((line, i) => (
              <div key={i} style={{ color: "#8aa88a", whiteSpace: "pre-wrap" }}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
