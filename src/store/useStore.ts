import { create } from "zustand";
import type { Board, ElectricalModel, McuState, SimResult } from "../model/board-model";
import { solve } from "../solver/solve";

export type Selection =
  | { kind: "part"; ref: string }
  | { kind: "block"; id: string }
  | null;

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

  // Actions
  setBoardId: (boardId: string) => void;
  setBoard: (board: Board) => void;
  setMcuState: (mcuState: McuState) => void;
  setSimResult: (simResult: SimResult | null) => void;
  setSelection: (selection: Selection) => void;
  setLogs: (logs: unknown[]) => void;
  setRunError: (runError: string | null) => void;
  setRunning: (running: boolean) => void;
  /** Reset per-board transient state (selection, mcuState, logs, error). */
  resetRuntimeState: () => void;
  /** Flip a servo part's stalled flag and re-solve the board. */
  toggleServoStall: (ref: string) => void;
  /** Replace a part's electrical model and re-solve. */
  setPartParam: (ref: string, model: ElectricalModel) => void;
  /** Restore every parameter to the board's originals and re-solve. */
  resetBoard: () => void;
}

const defaultMcuState: McuState = {
  modes: {},
  outputs: {},
};

export const useStore = create<AppState>((set) => ({
  boardId: null,
  board: null,
  originalBoard: null,
  mcuState: defaultMcuState,
  simResult: null,
  selection: null,

  logs: [],
  runError: null,
  running: false,

  setBoardId: (boardId) => set({ boardId }),
  // Capture a pristine snapshot alongside the live board for modified/reset.
  setBoard: (board) => set({ board, originalBoard: structuredClone(board) }),
  setMcuState: (mcuState) => set({ mcuState }),
  setSimResult: (simResult) => set({ simResult }),
  setSelection: (selection) => set({ selection }),
  setLogs: (logs) => set({ logs }),
  setRunError: (runError) => set({ runError }),
  setRunning: (running) => set({ running }),
  resetRuntimeState: () =>
    set({
      mcuState: { modes: {}, outputs: {} },
      selection: null,
      logs: [],
      runError: null,
      running: false,
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
}));
