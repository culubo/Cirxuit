/**
 * InspectorPanel — the right-hand column in Simulate mode.
 *
 *   • Parts list with data-testid="part-<REF>" entries (click to select).
 *   • The selected part: blurb, device state, pad voltages, editable values,
 *     and the servo Stall toggle.
 *   • data-testid="inspector-current-<REF>" — live branch current per part.
 *   • The solver's warnings, tagged warning-<ref> / warning-<netId>.
 *
 * The sketch editor, Run, and the console live in the editor pane.
 */
import React, { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import type { Board, ElectricalModel, Part, SimResult } from "../model/board-model";
import ParamField from "./ParamField";
import { numericFields } from "./modelFields";
import { formatEngineering } from "./parse-eng";
import { formatQuantity } from "./format";
import { tokens } from "./tokens";
import { deviceStateColor, netColor } from "./semanticColors";

// ─── formatting ───────────────────────────────────────────────────────────────

function branchAmps(simResult: SimResult | null, ref: string): number | null {
  if (!simResult) return null;
  const b = simResult.branches.find((br) => br.ref === ref);
  return b?.amps ?? null;
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
  height: "100%",
  overflowY: "auto",
  background: tokens.panel,
  borderLeft: `1px solid ${tokens.panelBorder}`,
  fontFamily: tokens.fontMono,
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
  const setSelection = useStore((s) => s.setSelection);
  const toggleServoStall = useStore((s) => s.toggleServoStall);
  const setPartParam = useStore((s) => s.setPartParam);
  const resetBoard = useStore((s) => s.resetBoard);
  const originalBoard = useStore((s) => s.originalBoard);

  const [paramError, setParamError] = useState<string | null>(null);

  const selectedPart =
    selection?.kind === "part"
      ? (board?.parts.find((p) => p.ref === selection.ref) ?? null)
      : null;

  const selectedRef = selectedPart?.ref ?? null;
  // Clear any stale validation message when the selected part changes.
  useEffect(() => {
    setParamError(null);
  }, [selectedRef]);

  if (board && board.parts.length === 0) {
    return (
      <aside aria-label="Inspector" style={panel}>
        <div style={section}>
          <div style={sectionLabel}>Parts</div>
          <div style={{ color: "#7a8ea4", fontSize: "0.75rem", lineHeight: 1.5 }}>
            This board has no parts yet. Switch to <b style={{ color: "#cfe3f2" }}>Build PCB</b> in the top bar to
            place a supply, a microcontroller, and some parts, then come back here to run it.
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside aria-label="Inspector" style={panel}>

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
                border: `1px solid ${tokens.controlBorder}`,
                borderRadius: "2px",
                color: tokens.textDim,
                fontFamily: tokens.fontMono,
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
                    background: isSelected ? tokens.controlActiveSoft : "transparent",
                    border: "1px solid",
                    borderColor: isSelected ? tokens.controlBorder : "transparent",
                    borderRadius: "2px",
                    color: isSelected ? tokens.phosphor : tokens.text,
                    fontFamily: tokens.fontMono,
                    fontSize: "0.78rem",
                    padding: "0.2rem 0.4rem",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontWeight: isSelected ? "bold" : "normal" }}>{part.ref}</span>
                  <span style={{ color: tokens.textFaint }}>{part.value}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Selected part summary + editable parameters ── */}
      {board && selectedPart && (
        <SelectedPartPanel
          board={board}
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
            const warning = simResult?.warnings.find((item) => item.ref === part.ref);
            const currentColor = isSelected
              ? tokens.phosphor
              : warning?.severity === "danger"
                ? tokens.danger
                : warning
                  ? tokens.thermal
                  : amps !== null && Math.abs(amps) > 1e-9
                    ? tokens.healthy
                    : tokens.textFaint;
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
                <span style={{ color: currentColor }}>{part.ref}</span>
                <span
                  data-testid={`inspector-current-${part.ref}`}
                  style={{
                    color: currentColor,
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
                    color: w.severity === "danger" ? tokens.danger : tokens.thermal,
                    borderLeft: `2px solid ${w.severity === "danger" ? tokens.danger : tokens.thermal}`,
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

      {/* A selected net (from a schematic wire or a board trace). */}
      {board && selection?.kind === "net" && (() => {
        const net = board.nets.find((n) => n.id === selection.netId);
        if (!net) return null;
        const volts = simResult?.netVoltages[net.id];
        return (
          <div style={section} data-testid="inspector-net">
            <div style={sectionLabel}>Net</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontWeight: "bold", color: tokens.phosphor }}>{net.name}</span>
              <span data-testid="inspector-net-voltage" style={{ color: tokens.text, fontVariantNumeric: "tabular-nums" }}>
                {volts !== undefined ? formatQuantity(volts, "V") : "—"}
              </span>
            </div>
            <div style={{ color: "#7a8ea4", fontSize: "0.72rem", marginTop: "0.3rem" }}>
              Connects {net.pads.map((p) => `${p.ref} ${p.pad}`).join(", ") || "nothing"}.
            </div>
          </div>
        );
      })()}

      {/* Nothing selected: say what the panel is for. */}
      {board && !selectedPart && selection?.kind !== "net" && (
        <div style={{ ...section, color: "#7a8ea4", fontSize: "0.74rem", lineHeight: 1.5 }}>
          Click a part above or on the board to see what it does, the voltage on each pad, and its editable values.
        </div>
      )}
    </aside>
  );
}

// ─── Selected part panel ─────────────────────────────────────────────────────

interface SelectedPartPanelProps {
  board: Board;
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
  board,
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
      <div style={{ fontWeight: "bold", color: tokens.phosphor }}>
        {part.ref}
        <span style={{ fontWeight: "normal", color: tokens.textDim, marginLeft: "0.4rem" }}>
          {part.value}
        </span>
        {deviceState && (
          <span
            data-testid={`device-state-${part.ref}`}
            style={{ marginLeft: "0.5rem", color: deviceStateColor(deviceState), fontWeight: "normal" }}
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
              <span style={{ color: pad.netId ? netColor(board, pad.netId) : tokens.textFaint }}>
                pad {pad.number}{pad.netId ? ` · ${pad.netId}` : ""}
              </span>
              <span
                data-testid={`inspector-pad-voltage-${part.ref}-${pad.number}`}
                style={{ color: pad.netId ? netColor(board, pad.netId) : tokens.textDim, fontVariantNumeric: "tabular-nums" }}
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
          style={{ color: tokens.danger, marginTop: "0.35rem", fontSize: "0.73rem" }}
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
            background: model.stalled ? "#351b13" : "#10271f",
            border: `1px solid ${model.stalled ? tokens.thermal : tokens.healthy}`,
            borderRadius: "2px",
            color: model.stalled ? tokens.thermal : tokens.healthy,
            fontFamily: tokens.fontMono,
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
