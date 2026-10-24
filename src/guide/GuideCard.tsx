/**
 * GuideCard — a collapsible walkthrough that floats over the viewport's top
 * left (never over the editor, inspector, or run controls). Steps tick off from
 * live state; the current step's control gets a pulsing outline.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { button, font } from "../ui/chrome";
import { tokens } from "../ui/tokens";
import Mascot from "../ui/brand/Mascot";
import { guideFor } from "./guides";
import type { Problem } from "../build/problems";

interface Props {
  problems: Problem[];
  /** Top-left over the 3D view; bottom-left over the builder (its toolbar is on top). */
  placement?: "top" | "bottom";
}

/** Follows a DOM element by testid and draws a pulsing ring around it. */
function TargetRing({ testId }: { testId: string }): React.ReactElement | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    const update = (): void => {
      const el = document.querySelector(`[data-testid="${testId}"]`);
      const r = el?.getBoundingClientRect() ?? null;
      setRect(r && r.width > 0 && r.height > 0 ? r : null);
    };
    update();
    const id = window.setInterval(update, 300);
    return () => window.clearInterval(id);
  }, [testId]);
  if (!rect) return null;
  return (
    <div
      aria-hidden="true"
      className="cx-guide-ring"
      style={{
        position: "fixed",
        left: rect.left - 4,
        top: rect.top - 4,
        width: rect.width + 8,
        height: rect.height + 8,
        border: `2px solid ${tokens.phosphor}`,
        borderRadius: "5px",
        pointerEvents: "none",
        zIndex: 60,
      }}
    />
  );
}

export default function GuideCard({ problems, placement = "top" }: Props): React.ReactElement | null {
  const boardId = useStore((s) => s.boardId);
  const open = useStore((s) => s.guideOpen);
  const setOpen = useStore((s) => s.setGuideOpen);
  const guideDone = useStore((s) => s.guideDone);
  const markDone = useStore((s) => s.markGuideDone);
  const state = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const [point, setPoint] = useState(true);

  const guide = guideFor(boardId);

  // Tick steps off as their checks pass. Completion sticks.
  useEffect(() => {
    if (!guide) return;
    for (const step of guide.steps) {
      if (!guideDone.includes(step.id) && step.done({ s: state, problems })) markDone(step.id);
    }
  }, [guide, guideDone, markDone, state, problems]);

  const currentIndex = useMemo(
    () => (guide ? guide.steps.findIndex((st) => !guideDone.includes(st.id)) : -1),
    [guide, guideDone],
  );

  if (!guide || !open) return null;
  const doneCount = guide.steps.filter((st) => guideDone.includes(st.id)).length;
  const current = currentIndex >= 0 ? guide.steps[currentIndex] : undefined;

  return (
    <>
      {point && current?.target && <TargetRing testId={current.target} />}
      <div
        data-testid="guide-panel"
        role="region"
        aria-label="Guide"
        style={{
          ...font,
          position: "absolute",
          ...(placement === "top" ? { top: "0.75rem" } : { bottom: "0.75rem" }),
          left: "0.75rem",
          zIndex: 20,
          width: collapsed ? "auto" : "19rem",
          maxHeight: placement === "top" ? "calc(100% - 10rem)" : "calc(100% - 4rem)",
          overflowY: "auto",
          background: "rgba(8,20,38,0.94)",
          border: `1px solid ${tokens.panelBorder}`,
          borderRadius: "5px",
          boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
          color: tokens.text,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.6rem", borderBottom: collapsed ? "none" : `1px solid ${tokens.hairline}` }}>
          <span style={{ color: tokens.phosphor, fontSize: "0.72rem", fontWeight: 700 }}>GUIDE</span>
          <span style={{ fontSize: "0.72rem", color: tokens.text, flex: 1 }}>{guide.title}</span>
          <span style={{ fontSize: "0.66rem", color: tokens.textFaint }}>{doneCount}/{guide.steps.length}</span>
          <button onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand guide" : "Collapse guide"} style={{ ...button(), height: "20px", padding: "0 0.35rem" }}>
            {collapsed ? "▾" : "▴"}
          </button>
          <button onClick={() => setOpen(false)} aria-label="Close guide" style={{ ...button(), height: "20px", padding: "0 0.35rem" }}>✕</button>
        </div>

        {!collapsed && (
          <div style={{ padding: "0.5rem 0.6rem 0.6rem" }}>
            <div style={{ display: "flex", gap: "0.55rem", alignItems: "flex-start", marginBottom: "0.5rem" }}>
              <Mascot pose={currentIndex < 0 ? "inspect" : "wave"} size={64} style={{ marginTop: "-0.2rem" }} />
              <p style={{ margin: 0, fontSize: "0.7rem", color: tokens.textDim, lineHeight: 1.5 }}>{guide.intro}</p>
            </div>
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              {guide.steps.map((step, i) => {
                const done = guideDone.includes(step.id);
                const isCurrent = i === currentIndex;
                return (
                  <li
                    key={step.id}
                    data-testid={`guide-step-${step.id}`}
                    data-done={done ? "true" : "false"}
                    style={{
                      padding: "0.35rem 0.45rem",
                      borderRadius: "3px",
                      background: isCurrent ? "rgba(79,216,255,0.08)" : "transparent",
                      border: `1px solid ${isCurrent ? "#1f6fb2" : "transparent"}`,
                    }}
                  >
                    <div style={{ display: "flex", gap: "0.45rem", alignItems: "baseline" }}>
                      <span style={{ color: done ? tokens.phosphor : isCurrent ? tokens.text : tokens.textFaint, width: "1rem", fontSize: "0.72rem" }}>
                        {done ? "✓" : `${i + 1}.`}
                      </span>
                      <span style={{ fontSize: "0.74rem", color: done ? tokens.textDim : tokens.text, textDecoration: done ? "line-through" : "none" }}>
                        {step.title}
                      </span>
                    </div>
                    {isCurrent && (
                      <div style={{ margin: "0.3rem 0 0 1.45rem", fontSize: "0.7rem", lineHeight: 1.5, color: tokens.textDim }}>
                        {step.detail}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {currentIndex < 0 ? (
              <div style={{ marginTop: "0.5rem", fontSize: "0.7rem", color: tokens.phosphor }}>All done. Try another board from the Board menu.</div>
            ) : (
              <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginTop: "0.5rem", fontSize: "0.66rem", color: tokens.textFaint, cursor: "pointer" }}>
                <input type="checkbox" checked={point} onChange={(e) => setPoint(e.target.checked)} />
                Point at the control for this step
              </label>
            )}
          </div>
        )}
      </div>
    </>
  );
}
