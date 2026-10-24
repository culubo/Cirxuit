/**
 * IntroPanel — what Circxit is and why it exists, with the logo and
 * mascot. Opens from the logo over the 3D view, never over the editor or
 * inspector.
 */
import React, { useEffect, useRef } from "react";
import { useStore } from "../../store/useStore";
import { loadSilkFont, SILK_FONT_FAMILY } from "../../scene/art/silkArt";
import { button, font } from "../chrome";
import { tokens } from "../tokens";
import Mascot, { orbUrl } from "./Mascot";
import { useIntro } from "./intro";

const STARTS: { board: string; title: string; detail: string }[] = [
  { board: "demo-board", title: "Light an LED", detail: "Run firmware that switches a transistor and watch the current reach the LED." },
  { board: "robot-controller-board", title: "Watch a board get built", detail: "A pick-and-place head assembles a 40-part robot controller, then it powers on." },
  { board: "biped-power-board", title: "Brown out a robot", detail: "Stall a walking robot's servos and see the battery rail collapse." },
  { board: "microduck-hat-board", title: "Inspect Microduck's HAT", detail: "Open the documented four-layer Robot HAT and see where it sits in Microduck's head." },
];

const WHY: string[] = [
  "A stalled servo drags the battery rail down and resets the controller.",
  "An LED pin with no current limit burns out a port.",
  "A sensor input left floating reads random values.",
];

export default function IntroPanel(): React.ReactElement | null {
  const open = useIntro((s) => s.open);
  const setOpen = useIntro((s) => s.setOpen);
  const setBoardId = useStore((s) => s.setBoardId);
  const setMode = useStore((s) => s.setMode);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { void loadSilkFont(); }, []);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      data-testid="intro-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="intro-title"
      style={{
        ...font,
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 50,
        width: "min(36rem, calc(100% - 1.5rem))",
        maxHeight: "calc(100% - 1.5rem)",
        overflowY: "auto",
        background: tokens.panel,
        border: `1px solid ${tokens.panelBorder}`,
        borderTop: `2px solid ${tokens.phosphor}`,
        borderRadius: "6px",
        boxShadow: "0 18px 50px rgba(0,0,0,0.6)",
        color: tokens.text,
      }}
    >
      <button
        ref={closeRef}
        onClick={() => setOpen(false)}
        aria-label="Close introduction"
        style={{ ...button(), position: "absolute", top: "0.6rem", right: "0.6rem", height: "24px", padding: "0 0.45rem" }}
      >
        ✕
      </button>

      <div style={{ display: "flex", gap: "1rem", alignItems: "center", padding: "1.2rem 1.3rem 0.4rem" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
            <img src={orbUrl} alt="" aria-hidden="true" width={50} height={50} style={{ display: "block", flex: "none" }} />
            <h1 id="intro-title" style={{ margin: 0, fontFamily: SILK_FONT_FAMILY, fontWeight: 400, fontSize: "1.75rem", letterSpacing: "0.02em", lineHeight: 1.05, whiteSpace: "nowrap" }}>
              Circxit
            </h1>
          </div>
          <p style={{ margin: "0.7rem 0 0", fontSize: "0.86rem", lineHeight: 1.5, color: tokens.text }}>
            See inside the board your robot runs on.
          </p>
        </div>
        <Mascot pose="inspect" size={260} style={{ margin: "-1rem -0.4rem -1.2rem 0" }} />
      </div>

      <div style={{ padding: "0.4rem 1.3rem 1.1rem", display: "flex", flexDirection: "column", gap: "0.9rem" }}>
        <section>
          <h2 style={heading}>What it is</h2>
          <p style={body}>
            An x-ray for robot electronics. Load a board, pull it apart layer by layer, and run Arduino-style
            firmware against a live circuit simulation. Every part shows its voltages and current, and every
            trace shows which way current flows.
          </p>
        </section>

        <section>
          <h2 style={heading}>Why we need it</h2>
          <p style={body}>
            When a robot misbehaves, the cause is often hardware the firmware developer never sees, and it looks
            exactly like a bug in the code:
          </p>
          <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            {WHY.map((w) => <li key={w} style={{ ...body, margin: 0 }}>{w}</li>)}
          </ul>
          <p style={{ ...body, marginTop: "0.45rem" }}>
            Circxit makes the board legible, so you can find these before you flash a single chip.
          </p>
        </section>

        <section>
          <h2 style={heading}>Start here</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            {STARTS.map((s) => (
              <button
                key={s.board}
                data-testid={`intro-start-${s.board}`}
                onClick={() => { setBoardId(s.board); setMode("simulate"); setOpen(false); }}
                style={{
                  ...font,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "0.15rem",
                  width: "100%",
                  textAlign: "left",
                  padding: "0.5rem 0.65rem",
                  background: "transparent",
                  border: `1px solid ${tokens.hairline}`,
                  borderLeft: `2px solid ${tokens.phosphor}`,
                  borderRadius: "3px",
                  color: tokens.text,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: "0.8rem" }}>{s.title}</span>
                <span style={{ fontSize: "0.7rem", color: tokens.textDim, lineHeight: 1.45 }}>{s.detail}</span>
              </button>
            ))}
          </div>
        </section>

        <p style={{ margin: 0, fontSize: "0.66rem", color: tokens.textFaint }}>
          Click the logo in the top bar to come back to this page.
        </p>
      </div>
    </div>
  );
}

const heading: React.CSSProperties = {
  margin: "0 0 0.3rem",
  fontFamily: SILK_FONT_FAMILY,
  fontWeight: 400,
  fontSize: "1rem",
  letterSpacing: "0.04em",
  color: tokens.phosphor,
};

const body: React.CSSProperties = {
  margin: 0,
  fontSize: "0.76rem",
  lineHeight: 1.6,
  color: tokens.textDim,
};
