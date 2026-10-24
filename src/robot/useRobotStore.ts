/**
 * Robot view UI state, kept apart from the main store. Entering the view folds
 * the board flat (it has to fit inside the robot's chest); leaving restores the
 * explode value the user had. Switching boards leaves the view.
 */
import { create } from "zustand";
import { useStore } from "../store/useStore";
import type { RobotPhase } from "./robotAnim";

interface RobotStore {
  robotView: boolean;
  /** The model has loaded and is in the scene. */
  ready: boolean;
  phase: RobotPhase;
  /** Explode value to restore when leaving the view. */
  savedExplode: number;
  setRobotView: (on: boolean) => void;
  setReady: (ready: boolean) => void;
  setPhase: (phase: RobotPhase) => void;
}

export const useRobotStore = create<RobotStore>((set, get) => ({
  robotView: false,
  ready: false,
  phase: "walk",
  savedExplode: 0,
  setRobotView: (on) => {
    if (on === get().robotView) return;
    const app = useStore.getState();
    if (on) {
      set({ robotView: true, savedExplode: app.explode });
      app.setExplode(0);
    } else {
      set({ robotView: false });
      app.setExplode(get().savedExplode);
    }
  },
  setReady: (ready) => set({ ready }),
  setPhase: (phase) => { if (get().phase !== phase) set({ phase }); },
}));

// Leave the view whenever the board changes.
useStore.subscribe((s, prev) => {
  if (s.boardId !== prev.boardId && useRobotStore.getState().robotView) {
    useRobotStore.setState({ robotView: false });
  }
});
