/**
 * EditorPane — the left column: run toolbar, sketch editor, and the bottom
 * panel (Console, Problems, Trace).
 */
import React from "react";
import { useStore, SPEEDS } from "../store/useStore";
import { backdrop, barTint, button, font, label, select } from "../ui/chrome";
import { tokens } from "../ui/tokens";
import CodeEditor from "./CodeEditor";
import BottomPanel from "./BottomPanel";
import type { RunnerCommands } from "./useRunner";
import type { ProblemSet } from "./useProblems";

interface Props {
  runner: RunnerCommands;
  problems: ProblemSet;
}

export default function EditorPane({ runner, problems }: Props): React.ReactElement {
  const board = useStore((s) => s.board);
  const boardId = useStore((s) => s.boardId);
  const running = useStore((s) => s.running);
  const speed = useStore((s) => s.speed);
  const setSpeed = useStore((s) => s.setSpeed);
  const playback = useStore((s) => s.playback);
  const setBottomTab = useStore((s) => s.setBottomTab);

  const hasTrace = (playback?.trace.length ?? 0) > 0;
  const atEnd = !playback || playback.index >= playback.trace.length - 1;
  const codeErrors = problems.codeErrors;
  const codeWarnings = problems.code.filter((p) => p.severity === "warning").length;
  const fileName = boardId ? `${boardId}.sketch.js` : "sketch.js";

  return (
    <section
      aria-label="Code"
      style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%", borderRight: `1px solid ${tokens.hairline}`, background: backdrop }}
    >
      {/* Run toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.4rem 0.5rem", borderBottom: `1px solid ${tokens.hairline}`, flexWrap: "wrap" }}>
        <button
          data-testid="run-button"
          title="Build and run the sketch (⌘/Ctrl + Enter)"
          onClick={() => void runner.run()}
          disabled={!board || running}
          style={button({ primary: true, disabled: !board || running })}
        >
          {running ? "Running…" : "▶ Run"}
        </button>
        <button
          data-testid="step-button"
          title="Run one pin call at a time (F10)"
          onClick={() => void runner.step()}
          disabled={!board || running}
          style={button({ disabled: !board || running })}
        >
          ⏭ Step
        </button>
        <button
          data-testid="pause-button"
          title={playback?.playing ? "Pause the replay" : "Resume the replay"}
          onClick={runner.togglePause}
          disabled={!hasTrace}
          style={button({ disabled: !hasTrace, active: playback?.playing ?? false })}
        >
          {playback?.playing ? "❚❚ Pause" : atEnd ? "↻ Replay" : "▶ Resume"}
        </button>
        <button
          data-testid="restart-button"
          title="Back to the start of this run"
          onClick={runner.restart}
          disabled={!hasTrace}
          style={button({ disabled: !hasTrace })}
        >
          ⏮
        </button>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", marginLeft: "0.2rem" }}>
          <span style={label}>Speed</span>
          <select
            data-testid="speed-select"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            style={select}
            title="Instant shows the result. Slower speeds replay the run step by step."
          >
            {SPEEDS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {/* File tab + build chip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0.6rem", height: "28px", borderBottom: `1px solid ${tokens.hairline}`, background: barTint }}>
        <span style={{ ...font, fontSize: "0.74rem", color: tokens.text }}>{fileName}</span>
        <button
          data-testid="build-chip"
          onClick={() => setBottomTab("problems")}
          title="Open the Problems panel"
          style={{
            ...font,
            fontSize: "0.7rem",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: codeErrors > 0 ? tokens.danger : codeWarnings > 0 ? tokens.amber : tokens.phosphor,
          }}
        >
          {codeErrors > 0
            ? `✕ ${codeErrors} build error${codeErrors === 1 ? "" : "s"}`
            : codeWarnings > 0
              ? `▲ ${codeWarnings} warning${codeWarnings === 1 ? "" : "s"}`
              : "✓ Builds"}
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <CodeEditor />
      </div>

      <div style={{ height: "36%", minHeight: "150px", borderTop: `1px solid ${tokens.panelBorder}` }}>
        <BottomPanel problems={problems} />
      </div>
    </section>
  );
}
