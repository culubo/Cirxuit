/**
 * SceneControls — thin, quiet chrome docked bottom-left: the explode slider and
 * the current-flow toggles. The 3D scene is the hero, so this stays minimal.
 */
import React from "react";
import { useStore } from "../store/useStore";
import { tokens } from "./tokens";
import { isRobotBoard } from "../robot/robotState";
import { useRobotStore } from "../robot/useRobotStore";
import { useLayerSheets } from "./LayerSheets";
import { useAssembly } from "../scene/assembly";

const wrap: React.CSSProperties = {
  position: "absolute",
  bottom: "1rem",
  left: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  fontFamily: tokens.fontMono,
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
  const hasSchematic = useStore((s) => Boolean(s.board?.schematic));
  const showSchematic = useStore((s) => s.showSchematic);
  const setShowSchematic = useStore((s) => s.setShowSchematic);
  const schematicOpacity = useStore((s) => s.schematicOpacity);
  const setSchematicOpacity = useStore((s) => s.setSchematicOpacity);
  const schematicVisible = showSchematic && explode > 0.6;
  const robotBoard = useStore((s) => isRobotBoard(s.board));
  const reference = useStore((s) => s.board?.simulation === "reference");
  const robotView = useRobotStore((s) => s.robotView);
  const setRobotView = useRobotStore((s) => s.setRobotView);
  const robotModel = useRobotStore((s) => s.model);
  const setRobotModel = useRobotStore((s) => s.setModel);
  const inRobot = robotBoard && robotView;
  const currentBoardId = useStore((s) => s.board?.id ?? null);
  const assemblyBoardId = useAssembly((s) => s.boardId);
  const assemblyStarted = useAssembly((s) => s.startedAt !== null);
  const assemblyPaused = useAssembly((s) => s.pausedAt !== null);
  const assemblyActive = assemblyStarted && assemblyBoardId === currentBoardId;
  const sheetsOpen = useLayerSheets((s) => s.open);
  const setSheetsOpen = useLayerSheets((s) => s.setOpen);

  return (
    <div className="cx-enter" style={wrap}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span style={label}>Explode</span>
        <input
          type="range"
          data-testid="explode-slider"
          min={0}
          max={1}
          step={0.01}
          value={explode}
          disabled={inRobot}
          title={inRobot ? "The board stays assembled inside the robot" : undefined}
          onChange={(e) => setExplode(Number(e.target.value))}
          style={{ width: "100%", accentColor: tokens.phosphor }}
        />
      </div>

      {assemblyActive && (
        <div style={toggleRow}>
          <span style={label}>Board build</span>
          <button
            data-testid="assembly-pause"
            aria-pressed={assemblyPaused}
            onClick={() => assemblyPaused ? useAssembly.getState().resume() : useAssembly.getState().pause()}
            style={{
              background: assemblyPaused ? tokens.controlActiveSoft : "transparent",
              border: `1px solid ${assemblyPaused ? tokens.controlBorder : tokens.hairline}`,
              borderRadius: "2px",
              color: assemblyPaused ? tokens.phosphor : tokens.text,
              fontFamily: tokens.fontMono,
              fontSize: "0.72rem",
              padding: "0.2rem 0.5rem",
              cursor: "pointer",
            }}
          >
            {assemblyPaused ? "Resume" : "Pause"}
          </button>
        </div>
      )}

      {!reference && <><div style={toggleRow}>
        <span style={label}>Current flow</span>
        <button
          data-testid="particle-toggle"
          aria-pressed={showParticles}
          onClick={() => setShowParticles(!showParticles)}
          style={{
            background: showParticles ? tokens.controlActiveSoft : "transparent",
            border: `1px solid ${showParticles ? tokens.controlBorder : tokens.hairline}`,
            borderRadius: "2px",
            color: showParticles ? tokens.phosphor : tokens.textFaint,
            fontFamily: tokens.fontMono,
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
            fontFamily: tokens.fontMono,
            fontSize: "0.72rem",
            padding: "0.2rem 0.5rem",
            cursor: "pointer",
          }}
        >
          {electronFlow ? "Electron" : "Conventional"}
        </button>
      </div></>}

      {!inRobot && (
        <div style={toggleRow}>
          <span style={label}>Layers</span>
          <button
            data-testid="layer-sheets-toggle"
            aria-pressed={sheetsOpen}
            onClick={() => setSheetsOpen(!sheetsOpen)}
            title="Show every board layer flat, side by side"
            style={{
              background: "transparent",
              border: `1px solid ${tokens.hairline}`,
              borderRadius: "2px",
              color: tokens.text,
              fontFamily: tokens.fontMono,
              fontSize: "0.72rem",
              padding: "0.2rem 0.5rem",
              cursor: "pointer",
            }}
          >
            Side by side
          </button>
        </div>
      )}
      {robotBoard && (
        <div style={toggleRow}>
          <span style={label}>Robot view</span>
          <button
            data-testid="robot-view-toggle"
            aria-pressed={robotView}
            onClick={() => setRobotView(!robotView)}
            title="Show the robot this board powers"
            style={{
              background: robotView ? tokens.controlActiveSoft : "transparent",
              border: `1px solid ${robotView ? tokens.controlBorder : tokens.hairline}`,
              borderRadius: "2px",
              color: robotView ? tokens.phosphor : tokens.textFaint,
              fontFamily: tokens.fontMono,
              fontSize: "0.72rem",
              padding: "0.2rem 0.5rem",
              cursor: "pointer",
            }}
          >
            {robotView ? "On" : "Off"}
          </button>
        </div>
      )}
      {inRobot && (
        <div style={toggleRow}>
          <label htmlFor="robot-model" style={label}>Robot</label>
          <select
            id="robot-model"
            data-testid="robot-model-select"
            value={robotModel}
            onChange={(e) => setRobotModel(e.target.value as "microduck" | "expressive")}
            style={{
              background: tokens.panel,
              border: `1px solid ${tokens.hairline}`,
              borderRadius: "2px",
              color: tokens.text,
              fontFamily: tokens.fontMono,
              fontSize: "0.72rem",
              padding: "0.15rem 0.3rem",
            }}
          >
            <option value="microduck">Microduck (physics)</option>
            <option value="expressive">Cartoon robot</option>
          </select>
        </div>
      )}
      {hasSchematic && !inRobot && (
        <>
          <div style={toggleRow}>
            <span style={label}>Schematic</span>
            <button
              data-testid="schematic-toggle"
              aria-pressed={schematicVisible}
              onClick={() => {
                if (!schematicVisible) {
                  setShowSchematic(true);
                  setExplode(1);
                } else {
                  setShowSchematic(false);
                }
              }}
              title="Show the schematic and fully explode the board"
              style={{
                background: schematicVisible ? tokens.controlActiveSoft : "transparent",
                border: `1px solid ${schematicVisible ? tokens.controlBorder : tokens.hairline}`,
                borderRadius: "2px",
                color: schematicVisible ? tokens.phosphor : tokens.textFaint,
                fontFamily: tokens.fontMono,
                fontSize: "0.72rem",
                padding: "0.2rem 0.5rem",
                cursor: "pointer",
              }}
            >
              {schematicVisible ? "Hide" : "Reveal"}
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", opacity: showSchematic ? 1 : 0.45 }}>
            <span style={label}>Schematic opacity</span>
            <input
              type="range"
              data-testid="schematic-opacity"
              aria-label="Schematic opacity"
              min={0}
              max={1}
              step={0.05}
              value={schematicOpacity}
              disabled={!showSchematic}
              onChange={(e) => setSchematicOpacity(Number(e.target.value))}
              style={{ width: "100%", accentColor: tokens.phosphor }}
            />
          </div>
          {showSchematic && !schematicVisible && (
            <span data-testid="schematic-hint" style={{ color: tokens.textFaint, fontSize: "0.66rem", lineHeight: 1.4 }}>
              Reveal moves the board to its fully exploded schematic view.
            </span>
          )}
        </>
      )}
    </div>
  );
}
