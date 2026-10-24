import { create } from "zustand";
import type { Board, ElectricalModel, McuState, SimResult } from "../model/board-model";
import { solve } from "../solver/solve";
import { applyTraceEvent, type TraceEvent } from "../runtime/execute";
import { blankDoc, isBuilderDoc, type BuilderDoc, type PadRef } from "../builder/doc";
import type { TemplateKind } from "../builder/templates";
import { starterSketch } from "../ide/starters";

export type Selection =
  | { kind: "part"; ref: string }
  | { kind: "net"; netId: string }
  | { kind: "block"; id: string }
  | null;

/** What the pointer is over, in either the board or the schematic. */
export type Hover = { kind: "part"; ref: string } | { kind: "net"; netId: string } | null;

export type Mode = "simulate" | "build";
export type BottomTab = "console" | "problems" | "trace";
export type BuilderTool = "select" | "wire" | "delete" | `place:${TemplateKind}`;
export type BuilderSelection = { kind: "part"; ref: string } | { kind: "wire"; id: string } | null;

/** Replay steps per second. 0 = Instant (apply the final state at once). */
export const SPEEDS: { value: number; label: string }[] = [
  { value: 0, label: "Instant" },
  { value: 8, label: "Fast · 8 steps/s" },
  { value: 4, label: "Normal · 4 steps/s" },
  { value: 2, label: "Slow · 2 steps/s" },
  { value: 1, label: "Very slow · 1 step/s" },
];

export interface Playback {
  trace: TraceEvent[];
  /** Index of the last applied event; -1 = before the first one. */
  index: number;
  playing: boolean;
  /** MCU state the run started from. */
  base: McuState;
  /** MCU state the run ended in (rolled back to `base` if it threw). */
  final: McuState;
  truncated: boolean;
  /** Code revision the trace belongs to; Step re-runs when the code changed. */
  codeRev: number;
}

export interface LastRun {
  n: number;
  status: "ok" | "error" | "blocked";
  durationMs: number;
  events: number;
  truncated: boolean;
  message?: string;
  errorLine?: number;
  blockedErrors?: number;
}

interface AppState {
  // Data
  boardId: string | null;
  board: Board | null;
  /** Pristine copy captured on load, for "modified" markers and Reset. */
  originalBoard: Board | null;
  mcuState: McuState;
  simResult: SimResult | null;
  selection: Selection;

  // Runtime output
  logs: unknown[];
  runError: string | null;
  running: boolean;

  // Scene controls
  explode: number;        // 0..1 layer separation target
  showParticles: boolean;
  electronFlow: boolean;  // false = conventional current direction
  hover: Hover;
  showSchematic: boolean;
  schematicOpacity: number;

  // IDE
  mode: Mode;
  /** Sketch per board id. Missing entries fall back to the board's starter. */
  codes: Record<string, string>;
  codeRev: number;
  speed: number;
  playback: Playback | null;
  lastRun: LastRun | null;
  /** Times a run was replayed slowly or stepped (drives the guide). */
  slowRuns: number;
  bottomTab: BottomTab;
  /** Request for the editor to move the cursor to a line. */
  editorJump: { line: number; nonce: number } | null;

  // Guide
  guideOpen: boolean;
  guideDone: string[];

  // Builder
  builderDoc: BuilderDoc;
  builderTool: BuilderTool;
  builderSelection: BuilderSelection;
  pendingWire: PadRef | null;

  // Actions
  setBoardId: (boardId: string) => void;
  setBoard: (board: Board) => void;
  setMcuState: (mcuState: McuState) => void;
  setSimResult: (simResult: SimResult | null) => void;
  setSelection: (selection: Selection) => void;
  setLogs: (logs: unknown[]) => void;
  setRunError: (runError: string | null) => void;
  setRunning: (running: boolean) => void;
  setExplode: (explode: number) => void;
  setShowParticles: (showParticles: boolean) => void;
  setElectronFlow: (electronFlow: boolean) => void;
  setHover: (hover: Hover) => void;
  /** Clear the hover only if it is still `hover` (pointer-out from one item after entering another). */
  clearHover: (hover: NonNullable<Hover>) => void;
  setShowSchematic: (show: boolean) => void;
  setSchematicOpacity: (opacity: number) => void;
  /** Reset per-board transient state (selection, mcuState, logs, error, playback). */
  resetRuntimeState: () => void;
  /** Flip a servo part's stalled flag and re-solve the board. */
  toggleServoStall: (ref: string) => void;
  /** Replace a part's electrical model and re-solve. */
  setPartParam: (ref: string, model: ElectricalModel) => void;
  /** Restore every parameter to the board's originals and re-solve. */
  resetBoard: () => void;

  setMode: (mode: Mode) => void;
  setCode: (code: string) => void;
  setSpeed: (speed: number) => void;
  setPlayback: (playback: Playback | null) => void;
  /** Apply trace events 0..index over the base state and re-solve. */
  setPlaybackIndex: (index: number) => void;
  setPlaying: (playing: boolean) => void;
  setLastRun: (lastRun: LastRun) => void;
  noteSlowRun: () => void;
  setBottomTab: (tab: BottomTab) => void;
  jumpToLine: (line: number) => void;
  setGuideOpen: (open: boolean) => void;
  markGuideDone: (id: string) => void;
  setBuilderDoc: (doc: BuilderDoc) => void;
  setBuilderTool: (tool: BuilderTool) => void;
  setBuilderSelection: (selection: BuilderSelection) => void;
  setPendingWire: (pad: PadRef | null) => void;
}

const defaultMcuState: McuState = {
  modes: {},
  outputs: {},
};

// ─── persistence ───────────────────────────────────────────────────────────────

const STORAGE = {
  doc: "circuit-xray:builder-doc",
  codes: "circuit-xray:codes",
  guide: "circuit-xray:guide-done",
} as const;

function readJson(key: string): unknown {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the session still works, it just won't persist.
  }
}

function initialDoc(): BuilderDoc {
  const stored = readJson(STORAGE.doc);
  return isBuilderDoc(stored) ? stored : blankDoc();
}

function initialCodes(): Record<string, string> {
  const stored = readJson(STORAGE.codes);
  if (typeof stored !== "object" || stored === null) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(stored)) if (typeof v === "string") out[k] = v;
  return out;
}

function initialGuide(): string[] {
  const stored = readJson(STORAGE.guide);
  return Array.isArray(stored) ? stored.filter((s): s is string => typeof s === "string") : [];
}

/** The sketch for the current board. */
export function currentCode(state: Pick<AppState, "codes" | "boardId">): string {
  const id = state.boardId ?? "";
  return state.codes[id] ?? starterSketch(state.boardId);
}

export const useStore = create<AppState>((set, get) => ({
  boardId: null,
  board: null,
  originalBoard: null,
  mcuState: defaultMcuState,
  simResult: null,
  selection: null,

  logs: [],
  runError: null,
  running: false,

  explode: 0,
  showParticles: true,
  electronFlow: false,
  hover: null,
  showSchematic: true,
  schematicOpacity: 0.9,

  mode: "simulate",
  codes: initialCodes(),
  codeRev: 0,
  speed: 0,
  playback: null,
  lastRun: null,
  slowRuns: 0,
  bottomTab: "console",
  editorJump: null,

  guideOpen: true,
  guideDone: initialGuide(),

  builderDoc: initialDoc(),
  builderTool: "select",
  builderSelection: null,
  pendingWire: null,

  setBoardId: (boardId) => set({ boardId }),
  // Capture a pristine snapshot alongside the live board for modified/reset.
  setBoard: (board) => set({ board, originalBoard: structuredClone(board) }),
  setMcuState: (mcuState) => set({ mcuState }),
  setSimResult: (simResult) => set({ simResult }),
  setSelection: (selection) => set({ selection }),
  setLogs: (logs) => set({ logs }),
  setRunError: (runError) => set({ runError }),
  setRunning: (running) => set({ running }),
  setExplode: (explode) => set({ explode }),
  setShowParticles: (showParticles) => set({ showParticles }),
  setElectronFlow: (electronFlow) => set({ electronFlow }),
  setHover: (hover) =>
    set((state) => {
      const same = state.hover === hover || (state.hover !== null && hover !== null
        && state.hover.kind === hover.kind
        && (hover.kind === "part" ? (state.hover as { ref: string }).ref === hover.ref : (state.hover as { netId: string }).netId === hover.netId));
      return same ? {} : { hover };
    }),
  clearHover: (hover) =>
    set((state) => {
      const h = state.hover;
      if (!h || h.kind !== hover.kind) return {};
      const match = hover.kind === "part" ? (h as { ref: string }).ref === hover.ref : (h as { netId: string }).netId === hover.netId;
      return match ? { hover: null } : {};
    }),
  setShowSchematic: (showSchematic) => set({ showSchematic }),
  setSchematicOpacity: (schematicOpacity) => set({ schematicOpacity: Math.max(0, Math.min(1, schematicOpacity)) }),
  resetRuntimeState: () =>
    set({
      mcuState: { modes: {}, outputs: {} },
      selection: null,
      hover: null,
      logs: [],
      runError: null,
      running: false,
      playback: null,
      lastRun: null,
    }),
  toggleServoStall: (ref) =>
    set((state) => {
      if (!state.board) return {};
      // Rebuild the board immutably with the target servo's `stalled` flipped.
      const board: Board = {
        ...state.board,
        parts: state.board.parts.map((part) => {
          if (part.ref !== ref || part.model?.type !== "servo") return part;
          return { ...part, model: { ...part.model, stalled: !part.model.stalled } };
        }),
      };
      return { board, simResult: solve(board, state.mcuState) };
    }),
  setPartParam: (ref, model) =>
    set((state) => {
      if (!state.board) return {};
      const board: Board = {
        ...state.board,
        parts: state.board.parts.map((part) =>
          part.ref === ref ? { ...part, model } : part,
        ),
      };
      return { board, simResult: solve(board, state.mcuState) };
    }),
  resetBoard: () =>
    set((state) => {
      if (!state.originalBoard) return {};
      const board = structuredClone(state.originalBoard);
      return {
        board,
        simResult: solve(board, state.mcuState),
        runError: null,
      };
    }),

  setMode: (mode) => set({ mode, pendingWire: null }),
  setCode: (code) =>
    set((state) => ({
      codes: { ...state.codes, [state.boardId ?? ""]: code },
      codeRev: state.codeRev + 1,
    })),
  setSpeed: (speed) => set({ speed }),
  setPlayback: (playback) => set({ playback }),
  setPlaybackIndex: (index) => {
    const { playback, board } = get();
    if (!playback || !board) return;
    const last = playback.trace.length - 1;
    const i = Math.max(-1, Math.min(last, index));
    let mcu = playback.base;
    const logs: unknown[] = [];
    for (let k = 0; k <= i; k++) {
      const ev = playback.trace[k]!;
      mcu = applyTraceEvent(mcu, ev);
      if (ev.kind === "log") logs.push(ev.text);
    }
    set({
      playback: { ...playback, index: i, playing: playback.playing && i < last },
      mcuState: mcu,
      simResult: solve(board, mcu),
      logs,
    });
  },
  setPlaying: (playing) =>
    set((state) => (state.playback ? { playback: { ...state.playback, playing } } : {})),
  setLastRun: (lastRun) => set({ lastRun }),
  noteSlowRun: () => set((state) => ({ slowRuns: state.slowRuns + 1 })),
  setBottomTab: (bottomTab) => set({ bottomTab }),
  jumpToLine: (line) => set((state) => ({ editorJump: { line, nonce: (state.editorJump?.nonce ?? 0) + 1 } })),
  setGuideOpen: (guideOpen) => set({ guideOpen }),
  markGuideDone: (id) =>
    set((state) => (state.guideDone.includes(id) ? {} : { guideDone: [...state.guideDone, id] })),
  setBuilderDoc: (builderDoc) => set({ builderDoc }),
  setBuilderTool: (builderTool) => set({ builderTool, pendingWire: null }),
  setBuilderSelection: (builderSelection) => set({ builderSelection }),
  setPendingWire: (pendingWire) => set({ pendingWire }),
}));

// Persist the user's board, sketches, and guide progress across reloads.
useStore.subscribe((state, prev) => {
  if (state.builderDoc !== prev.builderDoc) writeJson(STORAGE.doc, state.builderDoc);
  if (state.codes !== prev.codes) writeJson(STORAGE.codes, state.codes);
  if (state.guideDone !== prev.guideDone) writeJson(STORAGE.guide, state.guideDone);
});
