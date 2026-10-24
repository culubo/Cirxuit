/**
 * robotState — what the biped robot should be doing, read ONLY from the
 * solver's result. The board supplies topology (which nets a servo's pads sit
 * on, which rail has a limit); every live quantity comes from `SimResult`.
 *
 * - every limited rail at or above its minimum, no servo stalled → walking
 * - rails fine, one or more servos stalled                       → limping
 * - any limited rail below its minimum                           → brownout
 */
import type { Board, SimResult } from "../model/board-model";

export type RobotState = "walking" | "limping" | "brownout";

/** Boards that are the power system of a walking robot. */
export const ROBOT_BOARD_IDS: ReadonlySet<string> = new Set(["biped-power-board", "microduck-hat-board"]);

export function isRobotBoard(board: Board | null | undefined): boolean {
  return Boolean(board && ROBOT_BOARD_IDS.has(board.id));
}

export interface RobotReading {
  state: RobotState;
  /** The rail that decides brownout (the lowest one relative to its limit). */
  rail: { netId: string; volts: number; minVolts: number } | null;
  /** Servos the solver shows drawing stall current, by ref. */
  stalled: string[];
}

/**
 * A servo counts as stalled when its effective resistance in the solution
 * (volts across it / amps through it) is closer to its stall resistance than
 * to its running resistance (geometric midpoint, since the two differ ~8×).
 */
export function stalledServos(board: Board, sim: SimResult): string[] {
  const out: string[] = [];
  for (const part of board.parts) {
    const m = part.model;
    if (m?.type !== "servo") continue;
    const net = (pad: string): string | undefined => part.pads.find((p) => p.number === pad)?.netId ?? undefined;
    const pos = net(m.posPad), neg = net(m.negPad);
    if (!pos || !neg) continue;
    const volts = Math.abs((sim.netVoltages[pos] ?? 0) - (sim.netVoltages[neg] ?? 0));
    const amps = sim.branches.find((b) => b.ref === part.ref)?.amps ?? 0;
    if (amps <= 1e-9 || volts <= 1e-9) continue; // unpowered: not stalling
    const ohms = volts / amps;
    if (ohms < Math.sqrt(m.runOhms * m.stallOhms)) out.push(part.ref);
  }
  return out;
}

export function readRobot(board: Board | null, sim: SimResult | null): RobotReading | null {
  if (!board || !sim) return null;
  let rail: RobotReading["rail"] = null;
  let brownout = false;
  for (const limit of board.railLimits ?? []) {
    const volts = sim.netVoltages[limit.netId];
    if (volts === undefined || !Number.isFinite(volts)) continue;
    const below = volts < limit.minVolts;
    // Report the rail with the least headroom.
    if (!rail || volts - limit.minVolts < rail.volts - rail.minVolts) {
      rail = { netId: limit.netId, volts, minVolts: limit.minVolts };
    }
    brownout ||= below;
  }
  const stalled = stalledServos(board, sim);
  const state: RobotState = brownout ? "brownout" : stalled.length > 0 ? "limping" : "walking";
  return { state, rail, stalled };
}
