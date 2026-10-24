/**
 * PaneResizer — the draggable divider between a side pane and the board view.
 *
 * Drag to resize, arrow keys to nudge (Shift for bigger steps), double-click
 * to restore the default. Widths are remembered per pane between visits.
 */
import React, { useCallback, useRef, useState } from "react";
import { tokens } from "./tokens";

const STEP = 16;
const BIG_STEP = 64;

/** A pane width that persists in localStorage, clamped to its limits. */
export function usePaneWidth(key: string, fallback: number, min: number, max: number): [number, (w: number) => void] {
  const storageKey = `circuit-xray:pane:${key}`;
  const clamp = useCallback((w: number) => Math.round(Math.min(max, Math.max(min, w))), [min, max]);
  const [width, setWidth] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem(storageKey));
      return Number.isFinite(stored) && stored > 0 ? clamp(stored) : fallback;
    } catch {
      return fallback;
    }
  });
  const set = useCallback((w: number) => {
    const next = clamp(w);
    setWidth(next);
    try { window.localStorage.setItem(storageKey, String(next)); } catch { /* not remembered; harmless */ }
  }, [clamp, storageKey]);
  return [width, set];
}

interface PaneResizerProps {
  /** Which edge of the board view this divider sits on. */
  side: "left" | "right";
  /** Accessible name, e.g. "Resize the code editor". */
  label: string;
  width: number;
  min: number;
  max: number;
  fallback: number;
  onResize: (width: number) => void;
}

export default function PaneResizer({ side, label, width, min, max, fallback, onResize }: PaneResizerProps): React.ReactElement {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [active, setActive] = useState(false);
  const [hover, setHover] = useState(false);
  // Dragging toward the board view grows a left pane and shrinks a right one.
  const sign = side === "left" ? 1 : -1;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      data-testid={`resize-${side}`}
      title={`${label}. Drag, or use the arrow keys. Double-click to reset.`}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, width };
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        setActive(true);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        onResize(drag.current.width + sign * (e.clientX - drag.current.x));
      }}
      onPointerUp={() => { drag.current = null; setActive(false); }}
      onPointerCancel={() => { drag.current = null; setActive(false); }}
      onDoubleClick={() => onResize(fallback)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? BIG_STEP : STEP;
        if (e.key === "ArrowLeft") { e.preventDefault(); onResize(width - sign * step); }
        if (e.key === "ArrowRight") { e.preventDefault(); onResize(width + sign * step); }
        if (e.key === "Home") { e.preventDefault(); onResize(min); }
        if (e.key === "End") { e.preventDefault(); onResize(max); }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        [side]: width - 3,
        width: 7,
        zIndex: 40,
        cursor: "col-resize",
        touchAction: "none",
        display: "flex",
        justifyContent: "center",
        outline: "none",
      }}
    >
      {/* The visible rule: a hairline that brightens while you hover or drag. */}
      <span
        aria-hidden="true"
        style={{
          width: active || hover ? 2 : 1,
          height: "100%",
          background: active ? tokens.phosphor : hover ? tokens.textFaint : "transparent",
          transition: "background 120ms ease, width 120ms ease",
        }}
      />
    </div>
  );
}
