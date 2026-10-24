/**
 * LayerSheets — every physical layer of the board laid out flat, side by side,
 * in stack order (top to bottom), like a fab drawing. It reuses the same baked
 * artwork the 3D stack is textured with, so the sheets match the board exactly.
 * Everything is drawn as seen from the top, so bottom-side layers are not mirrored.
 */
import React, { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import type { Board } from "../model/board-model";
import { useStore } from "../store/useStore";
import { bakeLayers, bakeSurfaces } from "../scene/bake/bakeBoard";
import { loadSilkFont } from "../scene/art/silkArt";
import { bakeSchematic } from "../scene/schematic/bakeSchematic";
import { tokens } from "./tokens";

export const useLayerSheets = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

interface Sheet {
  key: string;
  title: string;
  detail: string;
  canvas: HTMLCanvasElement;
}

function bakeSheets(board: Board): Sheet[] | null {
  const surfaces = bakeSurfaces(board);
  const films = bakeLayers(board);
  if (!surfaces || !films) return null;
  const th = `${board.thicknessMm} mm`;
  const schematic = bakeSchematic(board);
  return [
    { key: "top", title: "Top side", detail: "finished: mask, ENIG, silk", canvas: surfaces.top.color },
    { key: "silk", title: "Silkscreen", detail: "epoxy ink", canvas: films.silk },
    { key: "mask", title: "Solder mask", detail: "LPI, ENIG openings", canvas: films.mask },
    { key: "copperTop", title: "F.Cu", detail: "top copper, 35 µm", canvas: films.copperTop },
    { key: "core", title: "FR-4 core", detail: th, canvas: films.core },
    { key: "copperBottom", title: "B.Cu", detail: "bottom copper, seen from top", canvas: films.copperBottom },
    { key: "bottom", title: "Bottom side", detail: "finished, seen from top", canvas: surfaces.bottom.color },
    ...(schematic ? [{ key: "schematic", title: "Circuit schematic", detail: "logical connectivity", canvas: schematic }] : []),
  ];
}

/** Copies a baked canvas into a displayed one (cheaper than encoding a PNG). */
function SheetCanvas({ source, label }: { source: HTMLCanvasElement; label: string }): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = source.width;
    c.height = source.height;
    c.getContext("2d")?.drawImage(source, 0, 0);
  }, [source]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      style={{ width: "100%", height: "auto", display: "block", aspectRatio: `${source.width} / ${source.height}` }}
    />
  );
}

export default function LayerSheets(): React.ReactElement | null {
  const open = useLayerSheets((s) => s.open);
  const setOpen = useLayerSheets((s) => s.setOpen);
  const board = useStore((s) => s.board);
  const [sheets, setSheets] = useState<{ id: string; list: Sheet[] } | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  // Bake when opened (artwork depends only on geometry, so once per board).
  useEffect(() => {
    if (!open || !board || sheets?.id === board.id) return;
    let cancelled = false;
    void loadSilkFont().then(() => {
      if (cancelled) return;
      const list = bakeSheets(board);
      if (list) setSheets({ id: board.id, list });
    });
    return () => { cancelled = true; };
  }, [open, board, sheets?.id]);

  // Esc backs out of a focused sheet, then closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      if (focused) setFocused(null); else setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, focused, setOpen]);

  if (!open || !board) return null;
  const list = sheets?.id === board.id ? sheets.list : null;
  const shown = list && focused ? list.filter((s) => s.key === focused) : list;

  return (
    <div
      data-testid="layer-sheets"
      role="region"
      aria-label="Board layers side by side"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        background: tokens.bg,
        display: "flex",
        flexDirection: "column",
        fontFamily: tokens.fontMono,
        color: tokens.text,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.9rem", borderBottom: `1px solid ${tokens.panelBorder}` }}>
        <span style={{ fontSize: "0.72rem", letterSpacing: "0.08em", textTransform: "uppercase", color: tokens.textFaint }}>Layers</span>
        <span style={{ fontSize: "0.75rem", color: tokens.textDim }}>
          {focused ? "Click the sheet or press Esc to see all layers." : "Top to bottom, as a fab stacks them. Click a sheet to enlarge it."}
        </span>
        <span style={{ flex: 1 }} />
        <button
          data-testid="layer-sheets-close"
          onClick={() => setOpen(false)}
          style={{ background: "transparent", border: `1px solid ${tokens.hairline}`, borderRadius: "2px", color: tokens.text, fontFamily: tokens.fontMono, fontSize: "0.72rem", padding: "0.2rem 0.6rem", cursor: "pointer" }}
        >
          Close
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "0.9rem" }}>
        {!shown ? (
          <span style={{ color: tokens.textFaint, fontSize: "0.75rem" }}>Drawing layers…</span>
        ) : (
          <ol
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gap: "0.9rem",
              gridTemplateColumns: focused ? "minmax(0, 1fr)" : "repeat(auto-fill, minmax(190px, 1fr))",
            }}
          >
            {shown.map((s, i) => (
              <li key={s.key}>
                <button
                  data-testid={`layer-sheet-${s.key}`}
                  aria-pressed={focused === s.key}
                  onClick={() => setFocused(focused === s.key ? null : s.key)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: tokens.panel,
                    border: `1px solid ${tokens.panelBorder}`,
                    borderRadius: "4px",
                    padding: "0.5rem",
                    cursor: focused ? "zoom-out" : "zoom-in",
                    color: "inherit",
                    font: "inherit",
                  }}
                >
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", marginBottom: "0.4rem" }}>
                    <span style={{ color: tokens.textFaint, fontSize: "0.68rem" }}>{focused ? "" : `${i + 1}.`}</span>
                    <span style={{ color: tokens.phosphor, fontSize: "0.78rem" }}>{s.title}</span>
                    <span style={{ color: tokens.textFaint, fontSize: "0.68rem" }}>{s.detail}</span>
                  </div>
                  {/* Dark backdrop so transparent films (silk, copper) read clearly. */}
                  <div style={{ background: "#061322", borderRadius: "2px", padding: "4px" }}>
                    <SheetCanvas source={s.canvas} label={`${s.title} layer of ${board.name}`} />
                  </div>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
