/**
 * SceneControls — thin, quiet chrome docked bottom-left: the explode slider and
 * the current-flow toggles. The 3D scene is the hero, so this stays minimal.
 */
import React from "react";
import { useStore } from "../store/useStore";
import { tokens } from "./tokens";

const wrap: React.CSSProperties = {
  position: "absolute",
  bottom: "1rem",
  left: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  fontFamily: "monospace",
  fontSize: "0.75rem",
  color: tokens.textDim,
  background: tokens.panel,
  border: `1px solid ${tokens.panelBorder}`,
  borderRadius: "4px",
  padding: "0.6rem 0.8rem",
  minWidth: "14rem",
  zIndex: 10,
};

const label: React.CSSProperties = {
  color: tokens.textFaint,
  fontSize: "0.68rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const toggleRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
};

export default function SceneControls(): React.ReactElement {
  const explode = useStore((s) => s.explode);
  const setExplode = useStore((s) => s.setExplode);
  const showParticles = useStore((s) => s.showParticles);
  const setShowParticles = useStore((s) => s.setShowParticles);
  const electronFlow = useStore((s) => s.electronFlow);
  const setElectronFlow = useStore((s) => s.setElectronFlow);

  return (
    <div style={wrap}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span style={label}>Explode</span>
        <input
          type="range"
          data-testid="explode-slider"
          min={0}
          max={1}
          step={0.01}
          value={explode}
          onChange={(e) => setExplode(Number(e.target.value))}
          style={{ width: "100%", accentColor: tokens.phosphor }}
        />
      </div>

      <div style={toggleRow}>
        <span style={label}>Current flow</span>
        <button
          data-testid="particle-toggle"
          aria-pressed={showParticles}
          onClick={() => setShowParticles(!showParticles)}
          style={{
            background: showParticles ? "#0e2a0e" : "transparent",
            border: `1px solid ${showParticles ? "#2a6a2a" : tokens.hairline}`,
            borderRadius: "2px",
            color: showParticles ? tokens.phosphor : tokens.textFaint,
            fontFamily: "monospace",
            fontSize: "0.72rem",
            padding: "0.2rem 0.5rem",
            cursor: "pointer",
          }}
        >
          {showParticles ? "On" : "Off"}
        </button>
      </div>

      <div style={toggleRow}>
        <span style={label}>Direction</span>
        <button
          data-testid="electron-flow-toggle"
          aria-pressed={electronFlow}
          onClick={() => setElectronFlow(!electronFlow)}
          style={{
            background: "transparent",
            border: `1px solid ${tokens.hairline}`,
            borderRadius: "2px",
            color: tokens.text,
            fontFamily: "monospace",
            fontSize: "0.72rem",
            padding: "0.2rem 0.5rem",
            cursor: "pointer",
          }}
        >
          {electronFlow ? "Electron" : "Conventional"}
        </button>
      </div>
    </div>
  );
}
