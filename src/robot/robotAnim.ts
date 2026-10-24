/**
 * robotAnim — the animation phase machine. The robot's logical state comes
 * from the solver (robotState.ts); this turns state changes into a readable
 * sequence: a brownout first freezes the robot mid-step, then it collapses;
 * when power returns it gets back up and walks again.
 */
import type { RobotState } from "./robotState";

export type RobotPhase = "walk" | "limp" | "freeze" | "collapse" | "recover";

/** How long the robot stands frozen mid-step before it collapses. */
export const FREEZE_S = 0.7;
/** How long getting back up takes before the walk resumes. */
export const RECOVER_S = 1.2;

const gait = (state: RobotState): RobotPhase => (state === "limping" ? "limp" : "walk");

/**
 * Next phase given the current one, seconds spent in it, and the solver state.
 * Returns the same phase when nothing changes.
 */
export function nextPhase(phase: RobotPhase, elapsed: number, state: RobotState): RobotPhase {
  if (state === "brownout") {
    if (phase === "freeze") return elapsed >= FREEZE_S ? "collapse" : "freeze";
    if (phase === "collapse") return "collapse";
    return "freeze";
  }
  switch (phase) {
    case "freeze": return gait(state);       // power back before it fell: keep going
    case "collapse": return "recover";
    case "recover": return elapsed >= RECOVER_S ? gait(state) : "recover";
    default: return gait(state);
  }
}

/** Animation clips this view uses from RobotExpressive.glb. */
export const CLIPS = { walk: "Walking", collapse: "Death" } as const;
