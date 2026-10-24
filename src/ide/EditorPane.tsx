/**
 * EditorPane — the left column: run toolbar, sketch editor, and the bottom
 * panel (Console, Problems, Trace).
 */
import React from "react";
import { useStore, SPEEDS } from "../store/useStore";
import { barTint, button, font, label, select } from "../ui/chrome";
import { tokens } from "../ui/tokens";
import CodeEditor from "./CodeEditor";
import BottomPanel from "./BottomPanel";
import type { RunnerCommands } from "./useRunner";
import type { ProblemSet } from "./useProblems";

interface Props {
  runner: RunnerCommands;
  problems: ProblemSet;
}

type MediaIconKind = "play" | "step" | "pause" | "restart";

function MediaIcon({ kind }: { kind: MediaIconKind }): React.ReactElement {
  const paths: Record<MediaIconKind, React.ReactNode> = {
    play: <path d="M4 2.5 12.5 8 4 13.5Z" />,
    step: <><path d="M3 3.5 9.5 8 3 12.5Z" /><path d="M11.5 3v10" /></>,
    pause: <><path d="M4.5 3v10" /><path d="M11.5 3v10" /></>,
    restart: <><path d="M3 3v4h4" /><path d="M3.8 6.2A5.2 5.2 0 1 1 3.4 10" /></>,
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill={kind === "play" || kind === "step" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {paths[kind]}
    </svg>
  );
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
  const reference = board?.simulation === "reference";

  return (
    <section
      aria-label="Code"
      style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%", borderRight: `1px solid ${tokens.hairline}`, background: tokens.panel }}
    >
      {/* Run toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.4rem 0.5rem", borderBottom: `1px solid ${tokens.hairline}`, flexWrap: "wrap" }}>
        <button
          data-testid="run-button"
          title={reference ? "This sourced layout has no runnable circuit model" : "Build and run the sketch (⌘/Ctrl + Enter)"}
          onClick={() => void runner.run()}
          disabled={!board || running || reference}
          style={button({ primary: true, disabled: !board || running || reference })}
        >
          {running ? "Running…" : <><MediaIcon kind="play" /> Run</>}
        </button>
        <button
          data-testid="step-button"
          title={reference ? "This sourced layout has no runnable circuit model" : "Run one pin call at a time (F10)"}
          onClick={() => void runner.step()}
          disabled={!board || running || reference}
          style={button({ disabled: !board || running || reference })}
        >
          <MediaIcon kind="step" /> Step
        </button>
        <button
          data-testid="pause-button"
          title={playback?.playing ? "Pause the replay" : "Resume the replay"}
          onClick={runner.togglePause}
          disabled={!hasTrace}
          style={button({ disabled: !hasTrace, active: playback?.playing ?? false })}
        >
          {playback?.playing ? <><MediaIcon kind="pause" /> Pause</> : atEnd ? <><MediaIcon kind="restart" /> Replay</> : <><MediaIcon kind="play" /> Resume</>}
        </button>
        <button
          data-testid="restart-button"
          aria-label="Restart replay"
          title="Back to the start of this run"
          onClick={runner.restart}
          disabled={!hasTrace}
          style={button({ disabled: !hasTrace })}
        >
          <MediaIcon kind="restart" />
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
