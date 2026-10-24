import { create } from "zustand";
import type { Board, McuState, SimResult } from "../model/board-model";

export type Selection =
  | { kind: "part"; ref: string }
  | { kind: "block"; id: string }
  | null;

interface AppState {
  // Data
  board: Board | null;
  mcuState: McuState;
  simResult: SimResult | null;
  selection: Selection;

  // Actions
  setBoard: (board: Board) => void;
  setMcuState: (mcuState: McuState) => void;
  setSimResult: (simResult: SimResult | null) => void;
  setSelection: (selection: Selection) => void;
}

const defaultMcuState: McuState = {
  modes: {},
  outputs: {},
};

export const useStore = create<AppState>((set) => ({
  board: null,
  mcuState: defaultMcuState,
  simResult: null,
  selection: null,

  setBoard: (board) => set({ board }),
  setMcuState: (mcuState) => set({ mcuState }),
  setSimResult: (simResult) => set({ simResult }),
  setSelection: (selection) => set({ selection }),
}));
