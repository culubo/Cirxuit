/**
 * BuilderSidebar — the right-hand column in Build PCB mode: the parts palette,
 * the selected part's values, board size and name, the live board checks, and
 * starter / export actions.
 */
import React, { useRef, useState } from "react";
import { currentCode, useStore } from "../store/useStore";
import {
  BLINK_SKETCH, blankDoc, blinkStarter, CUSTOM_BOARD_ID, deletePart, deleteWire, docToBoard,
  rotatePart, setPartModel,
} from "./doc";
import { PALETTE_ORDER, TEMPLATES, valueLabel } from "./templates";
import { createProject, MAX_PROJECT_BYTES, parseProjectJson, type CircxitProject } from "./projectFile";
import ParamField from "../ui/ParamField";
import { formatEngineering } from "../ui/parse-eng";
import { numericFields } from "../ui/modelFields";
import { backdrop, button, font, label, severityColor, severityGlyph } from "../ui/chrome";
import { tokens } from "../ui/tokens";
import type { Problem } from "../build/problems";

const section: React.CSSProperties = { padding: "0.6rem 0.75rem", borderBottom: `1px solid ${tokens.hairline}` };

export default function BuilderSidebar({ boardProblems }: { boardProblems: Problem[] }): React.ReactElement {
  const doc = useStore((s) => s.builderDoc);
  const setDoc = useStore((s) => s.setBuilderDoc);
  const tool = useStore((s) => s.builderTool);
  const setTool = useStore((s) => s.setBuilderTool);
  const setStickyPlacement = useStore((s) => s.setBuilderPlacementSticky);
  const selection = useStore((s) => s.builderSelection);
  const setSelection = useStore((s) => s.setBuilderSelection);
  const setMode = useStore((s) => s.setMode);
  const setCode = useStore((s) => s.setCode);
  const code = useStore(currentCode);
  const importBuilderProject = useStore((s) => s.importBuilderProject);
  const boardId = useStore((s) => s.boardId);
  const [paramError, setParamError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<CircxitProject | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const part = selection?.kind === "part" ? doc.parts.find((p) => p.ref === selection.ref) ?? null : null;
  const wire = selection?.kind === "wire" ? doc.wires.find((w) => w.id === selection.id) ?? null : null;
  const errors = boardProblems.filter((p) => p.severity === "error").length;

  const loadStarter = (): void => {
    setDoc(blinkStarter());
    setSelection(null);
    if (boardId === CUSTOM_BOARD_ID) setCode(BLINK_SKETCH);
  };

  const downloadJson = (filename: string, value: unknown): void => {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const slug = doc.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "board";
  const exportProject = (): void => downloadJson(`${slug}.circxit.json`, createProject(doc, code));
  const exportBoard = (): void => downloadJson(`${slug}.board.json`, docToBoard(doc));

  const applyImport = (project: CircxitProject): void => {
    importBuilderProject(project.design, project.sketch?.code);
    setPendingImport(null);
    setImportError(null);
    setImportStatus(`Imported ${project.design.name}: ${project.design.parts.length} parts and ${project.design.wires.length} wires.`);
  };

  const readImport = async (file: File): Promise<void> => {
    setImportError(null);
    setImportStatus(null);
    setPendingImport(null);
    if (file.size > MAX_PROJECT_BYTES) {
      setImportError("Project files must be smaller than 2 MB.");
      return;
    }
    let source: string;
    try {
      source = await file.text();
    } catch {
      setImportError("Circxit could not read that file.");
      return;
    }
    const parsed = parseProjectJson(source);
    if (!parsed.ok) {
      setImportError(parsed.error);
      return;
    }
    if (doc.parts.length > 0 || doc.wires.length > 0) setPendingImport(parsed.project);
    else applyImport(parsed.project);
  };

  return (
    <aside aria-label="Builder" style={{ ...font, height: "100%", overflowY: "auto", background: backdrop, borderLeft: `1px solid ${tokens.panelBorder}`, color: tokens.text, fontSize: "0.78rem" }}>
      {/* Palette */}
      <div style={section}>
        <div style={{ ...label, marginBottom: "0.4rem" }}>Parts palette</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.3rem" }}>
          {PALETTE_ORDER.map((kind) => {
            const tpl = TEMPLATES[kind];
            const active = tool === `place:${kind}`;
            return (
              <button
                key={kind}
                data-testid={`palette-${kind}`}
                title={`${tpl.hint} Shift-click to keep placing this part.`}
                aria-pressed={active}
                onClick={(event) => {
                  if (event.shiftKey) {
                    setTool(`place:${kind}`);
                    setStickyPlacement(true);
                  } else {
                    setStickyPlacement(false);
                    setTool(active ? "select" : `place:${kind}`);
                  }
                }}
                style={{
                  ...font,
                  textAlign: "left",
                  padding: "0.35rem 0.45rem",
                  fontSize: "0.72rem",
                  lineHeight: 1.3,
                  borderRadius: "3px",
                  cursor: "pointer",
                  color: active ? tokens.selectionInk : tokens.text,
                  background: active ? tokens.phosphor : tokens.panelRaised,
                  border: `1px solid ${active ? tokens.phosphor : tokens.panelBorder}`,
                }}
              >
                <div style={{ fontWeight: 600 }}>{tpl.label}</div>
                <div style={{ fontSize: "0.62rem", color: active ? tokens.selectionInk : tokens.textFaint }}>{tpl.refPrefix} · {tpl.footprint.split(":")[1]?.split("_").slice(0, 2).join(" ")}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selection */}
      <div style={section}>
        <div style={{ ...label, marginBottom: "0.4rem" }}>Selected</div>
        {part ? (
          <div data-testid="builder-properties">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ color: tokens.phosphor, fontWeight: 700 }}>{part.ref}</span>
              <span style={{ color: tokens.textDim }}>{TEMPLATES[part.kind].label} · {valueLabel(part.model)}</span>
            </div>
            <div style={{ color: tokens.textDim, fontSize: "0.7rem", lineHeight: 1.45, margin: "0.3rem 0" }}>{TEMPLATES[part.kind].hint}</div>
            {numericFields(part.model).map((f) => (
              <ParamField
                key={f.key}
                kind="text"
                paramKey={`build-${f.key}`}
                label={f.label}
                value={formatEngineering(f.value)}
                modified={false}
                onCommit={(v) => setDoc(setPartModel(doc, part.ref, f.withValue(v)))}
                onError={setParamError}
              />
            ))}
            {part.model.type === "potentiometer" && (
              <ParamField
                kind="slider" paramKey="build-wiper" label="wiper" value={part.model.wiper} min={0} max={1} step={0.01} modified={false}
                onCommit={(v) => { if (part.model.type === "potentiometer") setDoc(setPartModel(doc, part.ref, { ...part.model, wiper: v })); }}
              />
            )}
            {paramError && <div role="alert" style={{ color: tokens.danger, fontSize: "0.7rem", marginTop: "0.3rem" }}>{paramError}</div>}
            <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.5rem" }}>
              <button onClick={() => setDoc(rotatePart(doc, part.ref))} style={button()}>⟳ Rotate</button>
              <button
                data-testid="builder-delete"
                onClick={() => { setDoc(deletePart(doc, part.ref)); setSelection(null); }}
                style={button({ danger: true })}
              >
                ✕ Delete
              </button>
            </div>
          </div>
        ) : wire ? (
          <div>
            <div style={{ color: tokens.text }}>Wire {wire.a.ref} {wire.a.pad} → {wire.b.ref} {wire.b.pad}</div>
            <button onClick={() => { setDoc(deleteWire(doc, wire.id)); setSelection(null); }} style={{ ...button({ danger: true }), marginTop: "0.4rem" }}>
              ✕ Delete wire
            </button>
          </div>
        ) : (
          <div style={{ color: tokens.textDim, fontSize: "0.72rem", lineHeight: 1.45 }}>
            Click a part on the board to change its value, rotate it, or delete it.
          </div>
        )}
      </div>

      {/* Board checks */}
      <div style={section} data-testid="builder-checks">
        <div style={{ ...label, marginBottom: "0.4rem" }}>Board checks</div>
        {boardProblems.length === 0 ? (
          <div style={{ color: tokens.healthy, fontSize: "0.72rem" }}>✓ The board passes its electrical rules check.</div>
        ) : (
          <>
            <div style={{ fontSize: "0.7rem", color: errors ? tokens.danger : tokens.amber, marginBottom: "0.3rem" }}>
              {errors ? `${errors} error${errors === 1 ? "" : "s"} to fix before this board will run correctly.` : "Warnings only: the board will run."}
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {boardProblems.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => { if (p.ref) setSelection({ kind: "part", ref: p.ref }); }}
                    style={{ ...font, display: "flex", gap: "0.4rem", width: "100%", textAlign: "left", background: "transparent", border: "none", color: tokens.text, fontSize: "0.7rem", lineHeight: 1.45, padding: "0.1rem 0", cursor: p.ref ? "pointer" : "default" }}
                  >
                    <span style={{ color: severityColor(p.severity) }}>{severityGlyph(p.severity)}</span>
                    <span>{p.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Board */}
      <div style={section}>
        <div style={{ ...label, marginBottom: "0.4rem" }}>Board</div>
        <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
          <span style={{ color: tokens.textDim, fontSize: "0.72rem" }}>name</span>
          <input
            data-testid="builder-name"
            value={doc.name}
            maxLength={40}
            onChange={(e) => setDoc({ ...doc, name: e.target.value })}
            style={{ ...font, width: "11rem", background: tokens.bg, border: `1px solid ${tokens.hairline}`, color: tokens.text, fontSize: "0.74rem", padding: "0.2rem 0.4rem", borderRadius: "2px" }}
          />
        </label>
        {(["widthMm", "heightMm"] as const).map((k) => (
          <ParamField
            key={k}
            kind="text"
            paramKey={`build-${k}`}
            label={k === "widthMm" ? "width (mm)" : "height (mm)"}
            value={String(doc[k])}
            modified={false}
            onCommit={(v) => setDoc({ ...doc, [k]: Math.max(10, Math.min(200, Math.round(v))) })}
            onError={setParamError}
          />
        ))}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.5rem" }}>
          <button data-testid="builder-starter" onClick={loadStarter} style={button()}>Load blink starter</button>
          <button data-testid="builder-clear" onClick={() => { setDoc({ ...blankDoc(), name: doc.name }); setSelection(null); }} style={button({ danger: true })}>
            Clear board
          </button>
          <button data-testid="builder-import" onClick={() => importInput.current?.click()} style={button()}>
            Import project
          </button>
          <input
            ref={importInput}
            data-testid="builder-import-file"
            type="file"
            accept=".circxit.json,application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void readImport(file);
            }}
          />
          <button data-testid="builder-export" onClick={exportProject} disabled={doc.parts.length === 0} style={button({ disabled: doc.parts.length === 0 })}>
            Export project
          </button>
          <button data-testid="builder-export-board" onClick={exportBoard} disabled={doc.parts.length === 0} style={button({ disabled: doc.parts.length === 0 })}>
            Export PCB
          </button>
        </div>
        <div style={{ marginTop: "0.4rem", color: tokens.textFaint, fontSize: "0.66rem", lineHeight: 1.4 }}>
          Project files preserve the editable design, generated PCB, and sketch. PCB export is a read-only board snapshot.
        </div>
        {pendingImport && (
          <div data-testid="builder-import-confirm" style={{ marginTop: "0.5rem", padding: "0.5rem", border: `1px solid ${tokens.amber}`, borderRadius: "3px", color: tokens.textDim }}>
            <div>Replace this design with <b style={{ color: tokens.text }}>{pendingImport.design.name}</b>?</div>
            <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.4rem" }}>
              <button data-testid="builder-import-replace" onClick={() => applyImport(pendingImport)} style={button({ primary: true })}>Replace</button>
              <button data-testid="builder-import-cancel" onClick={() => setPendingImport(null)} style={button()}>Cancel</button>
            </div>
          </div>
        )}
        {importError && <div data-testid="builder-import-error" role="alert" style={{ color: tokens.danger, fontSize: "0.7rem", marginTop: "0.4rem" }}>{importError}</div>}
        {importStatus && <div data-testid="builder-import-status" role="status" style={{ color: tokens.healthy, fontSize: "0.7rem", marginTop: "0.4rem" }}>{importStatus}</div>}
      </div>

      <div style={section}>
        <button data-testid="builder-simulate" onClick={() => setMode("simulate")} style={{ ...button({ primary: true }), width: "100%", justifyContent: "center" }}>
          ▶ Simulate this board
        </button>
      </div>
    </aside>
  );
}
