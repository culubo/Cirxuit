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
import type { Board, ElectricalModel, Part, SimResult } from "../model/board-model";
import { createRuntime, type Runtime } from "../runtime/runtime";
import ParamField from "./ParamField";
import { formatEngineering } from "./parse-eng";
import { formatQuantity } from "./format";

// ─── formatting ───────────────────────────────────────────────────────────────

function branchAmps(simResult: SimResult | null, ref: string): number | null {
  if (!simResult) return null;
  const b = simResult.branches.find((br) => br.ref === ref);
  return b?.amps ?? null;
}

/** A single editable numeric field derived from a part's electrical model. */
interface NumericFieldDesc {
  key: string;            // "ohms", "vf", "beta", "volts", "runOhms", "stallOhms"
  label: string;
  value: number;
  /** Build a new model with this field replaced by `v`. */
  withValue: (v: number) => ElectricalModel;
}

/** Return the editable numeric fields for a model (excludes the pot wiper slider). */
function numericFields(model: ElectricalModel): NumericFieldDesc[] {
  switch (model.type) {
    case "resistor":
      return [{ key: "ohms", label: "ohms", value: model.ohms, withValue: (v) => ({ ...model, ohms: v }) }];
    case "led":
      return [{ key: "vf", label: "vf (V)", value: model.vf, withValue: (v) => ({ ...model, vf: v }) }];
    case "diode":
      return [{ key: "vf", label: "vf (V)", value: model.vf, withValue: (v) => ({ ...model, vf: v }) }];
    case "npn":
      return [{ key: "beta", label: "beta", value: model.beta, withValue: (v) => ({ ...model, beta: v }) }];
    case "vsource":
      return [{ key: "volts", label: "volts (V)", value: model.volts, withValue: (v) => ({ ...model, volts: v }) }];
    case "servo":
      return [
        { key: "runOhms", label: "run Ω", value: model.runOhms, withValue: (v) => ({ ...model, runOhms: v }) },
        { key: "stallOhms", label: "stall Ω", value: model.stallOhms, withValue: (v) => ({ ...model, stallOhms: v }) },
      ];
    case "potentiometer":
    case "capacitor":
    case "mcu":
      return [];
    default: {
      const _exhaustive: never = model;
      return _exhaustive;
    }
  }
}

/** Look up the original numeric value of a field for modified-marker detection. */
function originalFieldValue(
  originalBoard: Board | null,
  ref: string,
  key: string,
): number | undefined {
  const model = originalBoard?.parts.find((p) => p.ref === ref)?.model;
  if (!model) return undefined;
  const found = (model as Record<string, unknown>)[key];
  return typeof found === "number" ? found : undefined;
}

const DEVICE_STATE_LABEL: Record<string, string> = {
  on: "on",
  off: "off",
  cutoff: "cutoff",
  active: "active",
  saturated: "saturated",
};

// ─── styles ──────────────────────────────────────────────────────────────────

const panel: React.CSSProperties = {
  position: "absolute",
  top: "1rem",
  right: "1rem",
  bottom: "1rem",
  width: "23rem",
  overflowY: "auto",
  background: "#0a1424",
  border: "1px solid #1c3350",
  borderRadius: "3px",
  fontFamily: "monospace",
  fontSize: "0.8rem",
  color: "#cfe3f2",
  display: "flex",
  flexDirection: "column",
};

const section: React.CSSProperties = {
  borderBottom: "1px solid #142640",
  padding: "0.6rem 0.8rem",
};

const sectionLabel: React.CSSProperties = {
  color: "#5a7a96",
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
  const toggleServoStall = useStore((s) => s.toggleServoStall);
  const setPartParam = useStore((s) => s.setPartParam);
  const resetBoard = useStore((s) => s.resetBoard);
  const originalBoard = useStore((s) => s.originalBoard);

  const [code, setCode] = useState("// Arduino-style code\ndigitalWrite(8, HIGH);");
  const [paramError, setParamError] = useState<string | null>(null);

  // Create the runtime once per board and keep it for the panel's lifetime.
  const runtimeRef = useRef<Runtime | null>(null);
  useEffect(() => {
    runtimeRef.current = board ? createRuntime(board) : null;
  }, [board]);

  const selectedPart =
    selection?.kind === "part"
      ? (board?.parts.find((p) => p.ref === selection.ref) ?? null)
      : null;

  const selectedRef = selectedPart?.ref ?? null;
  // Clear any stale validation message when the selected part changes.
  useEffect(() => {
    setParamError(null);
  }, [selectedRef]);

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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={sectionLabel}>Parts</div>
            <button
              data-testid="reset-board-button"
              onClick={() => resetBoard()}
              title="Restore every parameter to the board default"
              style={{
                background: "transparent",
                border: "1px solid #24466e",
                borderRadius: "2px",
                color: "#8aa8c4",
                fontFamily: "monospace",
                fontSize: "0.68rem",
                padding: "0.15rem 0.5rem",
                cursor: "pointer",
              }}
            >
              Reset board
            </button>
          </div>
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
                    background: isSelected ? "#0c2a48" : "transparent",
                    border: "1px solid",
                    borderColor: isSelected ? "#1f6fb2" : "transparent",
                    borderRadius: "2px",
                    color: isSelected ? "#4fd8ff" : "#aac4dc",
                    fontFamily: "monospace",
                    fontSize: "0.78rem",
                    padding: "0.2rem 0.4rem",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontWeight: isSelected ? "bold" : "normal" }}>{part.ref}</span>
                  <span style={{ color: "#6a7e94" }}>{part.value}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Selected part summary + editable parameters ── */}
      {selectedPart && (
        <SelectedPartPanel
          part={selectedPart}
          deviceState={simResult?.deviceStates[selectedPart.ref]}
          netVoltages={simResult?.netVoltages}
          originalBoard={originalBoard}
          paramError={paramError}
          onParamError={setParamError}
          onCommit={(model) => { setPartParam(selectedPart.ref, model); }}
          onToggleStall={() => toggleServoStall(selectedPart.ref)}
        />
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
                <span style={{ color: isSelected ? "#4fd8ff" : "#5a7a96" }}>{part.ref}</span>
                <span
                  data-testid={`inspector-current-${part.ref}`}
                  style={{
                    color: isSelected ? "#4fd8ff" : "#8a9cb0",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {amps !== null ? formatQuantity(amps, "A") : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Warnings feed — always mounted when a board is loaded. Each warning
           with a netId also carries data-testid="warning-<netId>" so e2e can
           assert rail state. ── */}
      {board && (
        <div style={section} data-testid="warning-feed">
          <div style={sectionLabel}>Warnings</div>
          {(simResult?.warnings.length ?? 0) === 0 ? (
            <div style={{ color: "#5a7a96", fontSize: "0.75rem" }}>No warnings.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {simResult!.warnings.map((w, i) => (
                <div
                  key={`${w.ref ?? w.netId ?? "w"}-${i}`}
                  {...(w.ref || w.netId ? { "data-testid": `warning-${w.ref ?? w.netId}` } : {})}
                  style={{
                    fontSize: "0.75rem",
                    color: w.severity === "danger" ? "#e0923a" : "#c8c88a",
                    borderLeft: `2px solid ${w.severity === "danger" ? "#a0402a" : "#6a6a2a"}`,
                    paddingLeft: "0.5rem",
                  }}
                >
                  {w.message}
                </div>
              ))}
            </div>
          )}
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
            background: "#06101c",
            border: "1px solid #142640",
            borderRadius: "2px",
            color: "#cfe3f2",
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
            background: board && !running ? "#0a2238" : "#08142a",
            border: `1px solid ${board && !running ? "#1f6fb2" : "#163252"}`,
            borderRadius: "2px",
            color: board && !running ? "#4fd8ff" : "#3a5a7a",
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
              <div key={i} style={{ color: "#8aa8c4", whiteSpace: "pre-wrap" }}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Selected part panel ─────────────────────────────────────────────────────

interface SelectedPartPanelProps {
  part: Part;
  deviceState: string | undefined;
  netVoltages: Record<string, number> | undefined;
  originalBoard: Board | null;
  paramError: string | null;
  onParamError: (message: string | null) => void;
  onCommit: (model: ElectricalModel) => void;
  onToggleStall: () => void;
}

function SelectedPartPanel({
  part,
  deviceState,
  netVoltages,
  originalBoard,
  paramError,
  onParamError,
  onCommit,
  onToggleStall,
}: SelectedPartPanelProps): React.ReactElement {
  const model = part.model;
  const fields = model ? numericFields(model) : [];
  const isPot = model?.type === "potentiometer";
  const isServo = model?.type === "servo";

  return (
    <div style={section}>
      <div style={sectionLabel}>Selected</div>
      <div style={{ fontWeight: "bold", color: "#4fd8ff" }}>
        {part.ref}
        <span style={{ fontWeight: "normal", color: "#8a9cb0", marginLeft: "0.4rem" }}>
          {part.value}
        </span>
        {deviceState && (
          <span
            data-testid={`device-state-${part.ref}`}
            style={{ marginLeft: "0.5rem", color: "#c8c88a", fontWeight: "normal" }}
          >
            [{DEVICE_STATE_LABEL[deviceState] ?? deviceState}]
          </span>
        )}
      </div>

      {part.blurb && (
        <div style={{ color: "#7a8ea4", marginTop: "0.25rem", fontSize: "0.75rem" }}>
          {part.blurb}
        </div>
      )}

      {/* Live pad voltages, formatted with SI prefixes via formatQuantity. */}
      {netVoltages && part.pads.length > 0 && (
        <div style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.05rem" }}>
          {part.pads.map((pad) => (
            <div key={pad.number} style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#6a7e94" }}>
                pad {pad.number}{pad.netId ? ` · ${pad.netId}` : ""}
              </span>
              <span
                data-testid={`inspector-pad-voltage-${part.ref}-${pad.number}`}
                style={{ color: "#aac4dc", fontVariantNumeric: "tabular-nums" }}
              >
                {pad.netId ? formatQuantity(netVoltages[pad.netId] ?? 0, "V") : "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Editable numeric parameters */}
      {model && (fields.length > 0 || isPot) && (
        <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.1rem" }}>
          {fields.map((f) => {
            const orig = originalFieldValue(originalBoard, part.ref, f.key);
            const modified = orig !== undefined && orig !== f.value;
            return (
              <ParamField
                key={f.key}
                kind="text"
                paramKey={f.key}
                label={f.label}
                value={formatEngineering(f.value)}
                modified={modified}
                onCommit={(v) => onCommit(f.withValue(v))}
                onError={onParamError}
              />
            );
          })}

          {isPot && model.type === "potentiometer" && (
            <ParamField
              kind="slider"
              paramKey="wiper"
              label="wiper"
              value={model.wiper}
              min={0}
              max={1}
              step={0.01}
              modified={originalFieldValue(originalBoard, part.ref, "wiper") !== model.wiper}
              onCommit={(v) => onCommit({ ...model, wiper: v })}
            />
          )}
        </div>
      )}

      {/* Shared inline validation error */}
      {paramError && (
        <div
          data-testid="inspector-param-error"
          role="alert"
          style={{ color: "#cc4444", marginTop: "0.35rem", fontSize: "0.73rem" }}
        >
          {paramError}
        </div>
      )}

      {/* One-click Stall toggle for servo parts. */}
      {isServo && model.type === "servo" && (
        <button
          data-testid="stall-toggle"
          aria-pressed={model.stalled}
          onClick={onToggleStall}
          style={{
            marginTop: "0.5rem",
            width: "100%",
            background: model.stalled ? "#3a1410" : "#0a2238",
            border: `1px solid ${model.stalled ? "#a0402a" : "#1f6fb2"}`,
            borderRadius: "2px",
            color: model.stalled ? "#e0923a" : "#4fd8ff",
            fontFamily: "monospace",
            fontSize: "0.78rem",
            padding: "0.35rem 0",
            cursor: "pointer",
          }}
        >
          {model.stalled ? "● Stalled — click to release" : "○ Running — click to stall"}
        </button>
      )}
    </div>
  );
}
