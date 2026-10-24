/**
 * Everything wrong with the current workspace, in one sorted list: sketch build
 * problems, board rules checks, the last run's error, and the solver's warnings.
 */
import { useMemo } from "react";
import { checkBoard } from "../build/checkBoard";
import { checkSketch } from "../build/checkSketch";
import { sortProblems, type Problem } from "../build/problems";
import { CUSTOM_BOARD_ID } from "../builder/doc";
import { currentCode, useStore } from "../store/useStore";

export interface ProblemSet {
  all: Problem[];
  code: Problem[];
  board: Problem[];
  codeErrors: number;
}

export function useProblems(): ProblemSet {
  const board = useStore((s) => s.board);
  const code = useStore((s) => currentCode(s));
  const simResult = useStore((s) => s.simResult);
  const lastRun = useStore((s) => s.lastRun);
  const runError = useStore((s) => s.runError);

  const codeProblems = useMemo(() => (board ? checkSketch(code, board) : []), [code, board]);
  const boardId = useStore((s) => s.boardId);
  const boardProblems = useMemo(
    () => (board ? checkBoard(board, { overlap: boardId === CUSTOM_BOARD_ID }) : []),
    [board, boardId],
  );

  return useMemo(() => {
    const run: Problem[] = [];
    if (runError && lastRun?.status === "error") {
      run.push({
        id: "run-error",
        severity: "error",
        source: "run",
        message: `Runtime error${lastRun.errorLine ? ` on line ${lastRun.errorLine}` : ""}: ${runError}`,
        ...(lastRun.errorLine !== undefined ? { line: lastRun.errorLine } : {}),
      });
    }

    const sim: Problem[] = [];
    if (simResult && !simResult.ok) {
      sim.push({
        id: "sim-fail",
        severity: "error",
        source: "sim",
        message: "The circuit could not be solved. Look for a short circuit or a part with nothing to connect to.",
      });
    }
    for (const [i, w] of (simResult?.warnings ?? []).entries()) {
      sim.push({
        id: `sim-${i}`,
        severity: w.severity === "danger" ? "error" : w.severity === "warn" ? "warning" : "info",
        source: "sim",
        message: w.message,
        ...(w.ref !== undefined ? { ref: w.ref } : {}),
        ...(w.netId !== undefined ? { netId: w.netId } : {}),
      });
    }

    const all = sortProblems([...codeProblems, ...run, ...boardProblems, ...sim]);
    return {
      all,
      code: codeProblems,
      board: boardProblems,
      codeErrors: codeProblems.filter((p) => p.severity === "error").length,
    };
  }, [codeProblems, boardProblems, simResult, runError, lastRun]);
}
