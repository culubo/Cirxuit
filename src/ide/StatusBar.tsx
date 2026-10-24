/**
 * StatusBar — one line that answers "is anything wrong?": build, board checks,
 * solver, replay position, and what is being edited.
 */
import React from "react";
import { useStore } from "../store/useStore";
import { font } from "../ui/chrome";
import { tokens } from "../ui/tokens";
import type { ProblemSet } from "./useProblems";

export default function StatusBar({ problems }: { problems: ProblemSet }): React.ReactElement {
  const board = useStore((s) => s.board);
  const simResult = useStore((s) => s.simResult);
  const playback = useStore((s) => s.playback);
  const mode = useStore((s) => s.mode);
  const lastRun = useStore((s) => s.lastRun);
  const setBottomTab = useStore((s) => s.setBottomTab);

  const codeErr = problems.codeErrors;
  const codeWarn = problems.code.filter((p) => p.severity === "warning").length;
  const boardErr = problems.board.filter((p) => p.severity === "error").length;
  const boardWarn = problems.board.filter((p) => p.severity === "warning").length;

  const item = (color: string): React.CSSProperties => ({
    ...font, fontSize: "0.7rem", color, background: "transparent", border: "none", cursor: "pointer", padding: "0 0.4rem", whiteSpace: "nowrap",
  });

  const replay = playback && playback.trace.length > 0 && (playback.playing || playback.index < playback.trace.length - 1)
    ? `Step ${playback.index + 1} / ${playback.trace.length}${playback.playing ? " · playing" : " · paused"}`
    : null;

  return (
    <footer
      data-testid="status-bar"
      style={{ display: "flex", alignItems: "center", height: "24px", padding: "0 0.4rem", borderTop: `1px solid ${tokens.panelBorder}`, background: "#071222", gap: "0.2rem" }}
    >
      <button data-testid="build-status" onClick={() => setBottomTab("problems")} style={item(codeErr ? tokens.danger : codeWarn ? tokens.amber : tokens.phosphor)}>
        {codeErr ? `✕ Build failed · ${codeErr} error${codeErr === 1 ? "" : "s"}` : codeWarn ? `▲ Build OK · ${codeWarn} warning${codeWarn === 1 ? "" : "s"}` : "✓ Build OK"}
      </button>
      <span style={{ color: tokens.hairline }}>│</span>
      <button data-testid="board-status" onClick={() => setBottomTab("problems")} style={item(boardErr ? tokens.danger : boardWarn ? tokens.amber : tokens.textDim)}>
        {boardErr ? `✕ Board · ${boardErr} error${boardErr === 1 ? "" : "s"}` : boardWarn ? `▲ Board · ${boardWarn} warning${boardWarn === 1 ? "" : "s"}` : "✓ Board checks pass"}
      </button>
      <span style={{ color: tokens.hairline }}>│</span>
      <span data-testid="solver-status" style={item(simResult && !simResult.ok ? tokens.danger : tokens.textDim)}>
        {board?.simulation === "reference" ? "Layout reference · no circuit model" : !simResult ? "Circuit · not solved" : simResult.ok ? `Circuit solved · ${simResult.iterations + 1} pass${simResult.iterations === 0 ? "" : "es"}` : "✕ Circuit did not solve"}
      </span>
      {replay && (
        <>
          <span style={{ color: tokens.hairline }}>│</span>
          <span data-testid="replay-status" style={item(tokens.phosphor)}>{replay}</span>
        </>
      )}
      {lastRun?.status === "error" && (
        <>
          <span style={{ color: tokens.hairline }}>│</span>
          <button onClick={() => setBottomTab("console")} style={item(tokens.danger)}>✕ Last run threw</button>
        </>
      )}
      <span style={{ flex: 1 }} />
      <span style={item(tokens.textFaint)}>{mode === "build" ? "Building" : "Simulating"} · {board?.name ?? "no board"}</span>
    </footer>
  );
}
