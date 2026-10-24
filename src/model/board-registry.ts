/**
 * board-registry.ts — the set of built-in boards the UI can switch between.
 *
 * Each entry lazily imports its JSON so Vite can code-split them.  The registry
 * is the single source of truth for the board switcher.
 */
import type { Board } from "./board-model";

export interface BoardEntry {
  id: string;
  label: string;
  load: () => Promise<Board>;
}

export const BOARD_REGISTRY: BoardEntry[] = [
  {
    id: "demo-board",
    label: "LED driver demo",
    load: async () => (await import("./demo-board.json")).default as Board,
  },
  {
    id: "biped-power-board",
    label: "Biped power (concept)",
    load: async () => (await import("./biped-power-board.json")).default as Board,
  },
  {
    id: "robot-controller-board",
    label: "Robot controller (assembly demo)",
    load: async () => (await import("./robot-controller-board.json")).default as Board,
  },
];

export const DEFAULT_BOARD_ID = "demo-board";

export function boardEntry(id: string): BoardEntry | undefined {
  return BOARD_REGISTRY.find((b) => b.id === id);
}
