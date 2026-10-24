/**
 * useRunner — runs the sketch through the worker runtime and drives playback.
 *
 * Run      builds first (code errors block the run), executes, then either
 *          applies the final state at once (Instant) or replays the trace at
 *          the chosen speed, re-solving the circuit after every step.
 * Step     runs if the trace is stale, then advances one event.
 * Pause    pauses or resumes a replay.
 * Restart  replays the current trace from the beginning.
 *
 * Mount the hook once (in the workbench); it owns the runtime instance and the
 * playback timer, and returns the commands for the toolbar and keymaps.
 */
import { useCallback, useEffect, useRef } from "react";
import { checkSketch } from "../build/checkSketch";
import { createRuntime, type Runtime, type RunResult } from "../runtime/runtime";
import { currentCode, useStore } from "../store/useStore";

export interface RunnerCommands {
  run: () => Promise<void>;
  step: () => Promise<void>;
  togglePause: () => void;
  restart: () => void;
}

/** Module-level handle so the editor keymap can reach the mounted runner. */
export const runnerRef: { current: RunnerCommands | null } = { current: null };

let runCounter = 0;

export function useRunner(): RunnerCommands {
  const board = useStore((s) => s.board);
  const speed = useStore((s) => s.speed);
  const playing = useStore((s) => s.playback?.playing ?? false);

  // One runtime per board (rebuilt when the board or its parameters change).
  const runtimeRef = useRef<Runtime | null>(null);
  useEffect(() => {
    runtimeRef.current = board ? createRuntime(board) : null;
  }, [board]);

  /** Execute the sketch; returns null if the build blocked it or a run is in flight. */
  const execute = useCallback(async (): Promise<RunResult | null> => {
    const state = useStore.getState();
    const runtime = runtimeRef.current;
    if (!state.board || !runtime || state.running) return null;

    const code = currentCode(state);
    const errors = checkSketch(code, state.board).filter((p) => p.severity === "error");
    const n = ++runCounter;
    if (errors.length > 0) {
      state.setLastRun({ n, status: "blocked", durationMs: 0, events: 0, truncated: false, blockedErrors: errors.length });
      state.setBottomTab("problems");
      return null;
    }

    // Finish any replay in progress so the new run starts from a settled state.
    const pb = state.playback;
    if (pb && pb.index < pb.trace.length - 1) {
      state.setPlaybackIndex(pb.trace.length - 1);
    }

    state.setRunning(true);
    state.setRunError(null);
    const started = performance.now();
    try {
      const result = await runtime.run(code);
      const s = useStore.getState();
      s.setLastRun({
        n,
        status: result.error ? "error" : "ok",
        durationMs: Math.round(performance.now() - started),
        events: result.trace.length,
        truncated: result.traceTruncated,
        ...(result.error ? { message: result.error } : {}),
        ...(result.errorLine !== undefined ? { errorLine: result.errorLine } : {}),
      });
      s.setRunError(result.error ?? null);
      return result;
    } catch (e: unknown) {
      // The runtime resolves rather than rejects, but never swallow.
      const s = useStore.getState();
      const message = e instanceof Error ? e.message : String(e);
      s.setRunError(message);
      s.setLastRun({ n, status: "error", durationMs: 0, events: 0, truncated: false, message });
      return null;
    } finally {
      useStore.getState().setRunning(false);
    }
  }, []);

  const loadTrace = useCallback((result: RunResult, playing: boolean): void => {
    const s = useStore.getState();
    s.setPlayback({
      trace: result.trace,
      index: -1,
      playing,
      base: result.startState,
      final: result.mcuState,
      truncated: result.traceTruncated,
      codeRev: s.codeRev,
    });
  }, []);

  const run = useCallback(async (): Promise<void> => {
    const result = await execute();
    if (!result) return;
    const s = useStore.getState();
    if (result.error) s.setBottomTab("console");

    if (s.speed === 0 || result.trace.length === 0) {
      // Instant: show the final state (rolled back if the sketch threw).
      loadTrace(result, false);
      useStore.setState((st) => (st.playback ? { playback: { ...st.playback, index: result.trace.length - 1 } } : {}));
      s.setMcuState(result.mcuState);
      s.setSimResult(result.simResult);
      s.setLogs(result.logs);
      return;
    }
    s.noteSlowRun();
    loadTrace(result, true);
    s.setPlaybackIndex(-1);
  }, [execute, loadTrace]);

  const step = useCallback(async (): Promise<void> => {
    const s = useStore.getState();
    const pb = s.playback;
    if (!pb || pb.codeRev !== s.codeRev || pb.trace.length === 0) {
      const result = await execute();
      if (!result) return;
      if (result.trace.length === 0) {
        const st = useStore.getState();
        st.setMcuState(result.mcuState);
        st.setSimResult(result.simResult);
        st.setLogs(result.logs);
        return;
      }
      loadTrace(result, false);
      useStore.getState().noteSlowRun();
      useStore.getState().setPlaybackIndex(0);
      return;
    }
    s.setPlaying(false);
    if (pb.index < pb.trace.length - 1) s.setPlaybackIndex(pb.index + 1);
  }, [execute, loadTrace]);

  const togglePause = useCallback((): void => {
    const s = useStore.getState();
    const pb = s.playback;
    if (!pb || pb.trace.length === 0) return;
    if (pb.index >= pb.trace.length - 1 && !pb.playing) {
      // At the end: Resume means replay from the start.
      s.setPlaybackIndex(-1);
      s.setPlaying(true);
      return;
    }
    s.setPlaying(!pb.playing);
  }, []);

  const restart = useCallback((): void => {
    const s = useStore.getState();
    if (!s.playback || s.playback.trace.length === 0) return;
    s.setPlaybackIndex(-1);
    s.setPlaying(s.speed !== 0);
  }, []);

  // Playback timer.
  useEffect(() => {
    if (!playing || speed === 0) return undefined;
    const id = window.setInterval(() => {
      const s = useStore.getState();
      const pb = s.playback;
      if (!pb || !pb.playing) return;
      s.setPlaybackIndex(pb.index + 1);
    }, 1000 / speed);
    return () => window.clearInterval(id);
  }, [playing, speed]);

  const commands: RunnerCommands = { run, step, togglePause, restart };
  runnerRef.current = commands;
  return commands;
}
