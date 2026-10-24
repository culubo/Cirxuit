/**
 * BuilderView — the 2D board editor for Build PCB mode.
 *
 * An SVG whose viewBox is in millimetres, so pointer positions map straight
 * to board space. Tools: Select (click to select, drag to move), Wire (click a
 * pad, then another pad), Delete, and Place (from the palette). Keys: V select,
 * W wire, R rotate, Delete/Backspace remove, Esc cancel.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import {
  addPart, addWire, deletePart, deleteWire, GRID_MM, movePart, padKey, padPosition,
  placedPads, rotatePart, snap, unwiredPads, wireRoute, type PadRef,
} from "./doc";
import { TEMPLATES, type TemplateKind } from "./templates";
import { button, font } from "../ui/chrome";
import { tokens } from "../ui/tokens";

const MARGIN = 4;

type Point = { x: number; y: number };

export default function BuilderView(): React.ReactElement {
  const doc = useStore((s) => s.builderDoc);
  const setDoc = useStore((s) => s.setBuilderDoc);
  const tool = useStore((s) => s.builderTool);
  const setTool = useStore((s) => s.setBuilderTool);
  const selection = useStore((s) => s.builderSelection);
  const setSelection = useStore((s) => s.setBuilderSelection);
  const pending = useStore((s) => s.pendingWire);
  const setPending = useStore((s) => s.setPendingWire);

  const svgRef = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [hoverPad, setHoverPad] = useState<string | null>(null);
  const drag = useRef<{ ref: string; dx: number; dy: number; moved: boolean } | null>(null);

  const unwired = useMemo(() => unwiredPads(doc), [doc]);
  const placing: TemplateKind | null = tool.startsWith("place:") ? (tool.slice(6) as TemplateKind) : null;

  const toBoard = useCallback((e: { clientX: number; clientY: number }): Point | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  }, []);

  // ── keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const s = useStore.getState();
      if (e.key === "Escape") { s.setPendingWire(null); s.setBuilderTool("select"); return; }
      if (e.key === "w" || e.key === "W") { s.setBuilderTool("wire"); return; }
      if (e.key === "v" || e.key === "V") { s.setBuilderTool("select"); return; }
      const sel = s.builderSelection;
      if ((e.key === "r" || e.key === "R") && sel?.kind === "part") {
        s.setBuilderDoc(rotatePart(s.builderDoc, sel.ref));
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        e.preventDefault();
        s.setBuilderDoc(sel.kind === "part" ? deletePart(s.builderDoc, sel.ref) : deleteWire(s.builderDoc, sel.id));
        s.setBuilderSelection(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── pointer handlers ─────────────────────────────────────────────────────
  const onBoardClick = (e: React.MouseEvent): void => {
    const p = toBoard(e);
    if (!p) return;
    if (placing) {
      const { doc: next, ref } = addPart(doc, placing, p.x, p.y);
      setDoc(next);
      setSelection({ kind: "part", ref });
      if (!e.shiftKey) setTool("select");
      return;
    }
    if (tool === "wire") { setPending(null); return; }
    setSelection(null);
  };

  const onPadClick = (e: React.MouseEvent, pad: PadRef): void => {
    e.stopPropagation();
    if (tool === "wire" || pending) {
      if (!pending) { setPending(pad); return; }
      setDoc(addWire(doc, pending, pad));
      // Keep wiring from the pad just reached, like a pen.
      setPending(pad);
      return;
    }
    if (tool === "delete") { setDoc(deletePart(doc, pad.ref)); return; }
    setSelection({ kind: "part", ref: pad.ref });
  };

  const onPartPointerDown = (e: React.PointerEvent, ref: string): void => {
    if (tool !== "select") return;
    e.stopPropagation();
    const p = toBoard(e);
    const part = doc.parts.find((x) => x.ref === ref);
    if (!p || !part) return;
    drag.current = { ref, dx: part.x - p.x, dy: part.y - p.y, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setSelection({ kind: "part", ref });
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    const p = toBoard(e);
    setCursor(p);
    const d = drag.current;
    if (!d || !p) return;
    const s = useStore.getState();
    const part = s.builderDoc.parts.find((x) => x.ref === d.ref);
    const nx = snap(p.x + d.dx), ny = snap(p.y + d.dy);
    if (part && (Math.abs(part.x - nx) > 1e-6 || Math.abs(part.y - ny) > 1e-6)) {
      d.moved = true;
      s.setBuilderDoc(movePart(s.builderDoc, d.ref, nx, ny));
    }
  };

  const onPointerUp = (): void => { drag.current = null; };

  const onPartClick = (e: React.MouseEvent, ref: string): void => {
    e.stopPropagation();
    if (tool === "delete") { setDoc(deletePart(doc, ref)); setSelection(null); }
  };

  const onWireClick = (e: React.MouseEvent, id: string): void => {
    e.stopPropagation();
    if (tool === "delete") { setDoc(deleteWire(doc, id)); return; }
    setSelection({ kind: "wire", id });
  };

  // ── render ────────────────────────────────────────────────────────────────
  const vb = `${-MARGIN} ${-MARGIN} ${doc.widthMm + MARGIN * 2} ${doc.heightMm + MARGIN * 2}`;
  const pendingAt = pending ? padPosition(doc, pending) : null;
  const toolBtn = (id: "select" | "wire" | "delete", text: string, key: string): React.ReactElement => (
    <button data-testid={`tool-${id}`} title={`${text} (${key})`} onClick={() => setTool(id)} style={button({ active: tool === id })}>
      {text}
    </button>
  );

  const statusText = placing
    ? `Click on the board to place ${TEMPLATES[placing].label}. Shift-click to place several. Esc cancels.`
    : tool === "wire"
      ? pending
        ? `Wiring from ${pending.ref} ${pending.pad}. Click another pad to connect; Esc to stop.`
        : "Click a pad to start a wire."
      : tool === "delete"
        ? "Click a part or wire to delete it."
        : doc.parts.length === 0
          ? "Pick a part from the palette on the right, or load the blink starter."
          : "Drag parts to move them. R rotates, Delete removes, W starts wiring.";

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%", background: tokens.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.4rem 0.6rem", borderBottom: `1px solid ${tokens.hairline}` }}>
        {toolBtn("select", "↖ Select", "V")}
        {toolBtn("wire", "⌇ Wire", "W")}
        {toolBtn("delete", "✕ Delete", "Del")}
        <button
          data-testid="tool-rotate"
          title="Rotate the selected part (R)"
          disabled={selection?.kind !== "part"}
          onClick={() => { if (selection?.kind === "part") setDoc(rotatePart(doc, selection.ref)); }}
          style={button({ disabled: selection?.kind !== "part" })}
        >
          ⟳ Rotate
        </button>
        <span data-testid="builder-hint" style={{ ...font, marginLeft: "0.6rem", fontSize: "0.72rem", color: tokens.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {statusText}
        </span>
      </div>

      <svg
        ref={svgRef}
        data-testid="builder-canvas"
        viewBox={vb}
        preserveAspectRatio="xMidYMid meet"
        style={{ flex: 1, minHeight: 0, width: "100%", cursor: placing ? "copy" : tool === "wire" ? "crosshair" : tool === "delete" ? "not-allowed" : "default", touchAction: "none" }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setCursor(null)}
      >
        <defs>
          <pattern id="cx-grid" width={GRID_MM} height={GRID_MM} patternUnits="userSpaceOnUse">
            <circle cx={GRID_MM / 2} cy={GRID_MM / 2} r={0.09} fill="#3a6ea8" opacity={0.55} />
          </pattern>
          <filter id="cx-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.35" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Board */}
        <rect x={0} y={0} width={doc.widthMm} height={doc.heightMm} rx={1.2} fill="#081a36" stroke="#2a7fc0" strokeWidth={0.25} onClick={onBoardClick} />
        <rect x={0} y={0} width={doc.widthMm} height={doc.heightMm} fill="url(#cx-grid)" pointerEvents="none" />
        <text x={0} y={-1.2} fontSize={1.6} fill={tokens.textFaint} style={{ fontFamily: tokens.fontMono }}>
          {doc.name} · {doc.widthMm} × {doc.heightMm} mm
        </text>

        {/* Wires (traces) */}
        {doc.wires.map((w) => {
          const a = padPosition(doc, w.a), b = padPosition(doc, w.b);
          if (!a || !b) return null;
          const pts = wireRoute(a, b).map((p) => `${p.x},${p.y}`).join(" ");
          const selected = selection?.kind === "wire" && selection.id === w.id;
          return (
            <g key={w.id} data-testid={`wire-${w.id}`} onClick={(e) => onWireClick(e, w.id)} style={{ cursor: "pointer" }}>
              <polyline points={pts} fill="none" stroke="transparent" strokeWidth={1.6} />
              <polyline points={pts} fill="none" stroke={selected ? "#ffffff" : "#3fb6f0"} strokeWidth={0.5} strokeLinecap="round" strokeLinejoin="round" filter="url(#cx-glow)" />
            </g>
          );
        })}

        {/* Rubber band for the wire in progress */}
        {pendingAt && cursor && (
          <polyline
            points={wireRoute(pendingAt, cursor).map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none" stroke={tokens.phosphor} strokeWidth={0.35} strokeDasharray="0.8 0.6" pointerEvents="none"
          />
        )}

        {/* Parts */}
        {doc.parts.map((part) => {
          const tpl = TEMPLATES[part.kind];
          const selected = selection?.kind === "part" && selection.ref === part.ref;
          const pads = placedPads(part);
          const quarter = part.rotation === 90 || part.rotation === 270;
          const bw = quarter ? tpl.body.h : tpl.body.w;
          const bh = quarter ? tpl.body.w : tpl.body.h;
          return (
            <g key={part.ref} data-testid={`builder-part-${part.ref}`}>
              <rect
                x={part.x - bw / 2} y={part.y - bh / 2} width={bw} height={bh} rx={0.3}
                fill={part.kind === "potentiometer" ? "#1c4a8c" : part.kind === "led" ? "#2a3446" : "#10141c"}
                stroke={selected ? tokens.phosphor : "#2a4a6e"}
                strokeWidth={selected ? 0.3 : 0.15}
                style={{ cursor: tool === "select" ? "move" : tool === "delete" ? "not-allowed" : "default" }}
                onPointerDown={(e) => onPartPointerDown(e, part.ref)}
                onClick={(e) => onPartClick(e, part.ref)}
              />
              <text
                x={part.x} y={part.y - bh / 2 - 0.6} fontSize={1.25} textAnchor="middle"
                fill={selected ? tokens.phosphor : tokens.text} pointerEvents="none" style={{ fontFamily: tokens.fontMono }}
              >
                {part.ref}
              </text>
              {pads.map((pad) => {
                const k = padKey({ ref: part.ref, pad: pad.number });
                const isPending = pending?.ref === part.ref && pending.pad === pad.number;
                const hovered = hoverPad === k;
                return (
                  <g
                    key={pad.number}
                    data-testid={`pad-${part.ref}-${pad.number}`}
                    onClick={(e) => onPadClick(e, { ref: part.ref, pad: pad.number })}
                    onMouseEnter={() => setHoverPad(k)}
                    onMouseLeave={() => setHoverPad(null)}
                    style={{ cursor: "crosshair" }}
                  >
                    <title>{`${part.ref} ${pad.number} · ${pad.role}`}</title>
                    <circle cx={pad.at.x} cy={pad.at.y} r={Math.max(pad.w, pad.h) / 2 + 0.6} fill="transparent" />
                    {pad.through ? (
                      <circle cx={pad.at.x} cy={pad.at.y} r={Math.min(pad.w, pad.h) / 2} fill="#bff0ff" />
                    ) : (
                      <rect x={pad.at.x - pad.w / 2} y={pad.at.y - pad.h / 2} width={pad.w} height={pad.h} rx={0.15} fill="#bff0ff" />
                    )}
                    {unwired.has(k) && part.kind !== "mcu" && (
                      <circle cx={pad.at.x} cy={pad.at.y} r={Math.max(pad.w, pad.h) / 2 + 0.35} fill="none" stroke={tokens.amber} strokeWidth={0.18} pointerEvents="none" />
                    )}
                    {(isPending || hovered) && (
                      <circle cx={pad.at.x} cy={pad.at.y} r={Math.max(pad.w, pad.h) / 2 + 0.55} fill="none" stroke={tokens.phosphor} strokeWidth={0.25} pointerEvents="none" />
                    )}
                    {(hovered || isPending) && (
                      <text x={pad.at.x} y={pad.at.y + Math.max(pad.w, pad.h) / 2 + 1.6} fontSize={1.05} textAnchor="middle" fill={tokens.phosphor} pointerEvents="none" style={{ fontFamily: tokens.fontMono }}>
                        {pad.number}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Placement ghost */}
        {placing && cursor && (
          <rect
            x={snap(cursor.x) - TEMPLATES[placing].body.w / 2}
            y={snap(cursor.y) - TEMPLATES[placing].body.h / 2}
            width={TEMPLATES[placing].body.w}
            height={TEMPLATES[placing].body.h}
            fill="none" stroke={tokens.phosphor} strokeWidth={0.2} strokeDasharray="0.6 0.4" pointerEvents="none"
          />
        )}
      </svg>
    </div>
  );
}
