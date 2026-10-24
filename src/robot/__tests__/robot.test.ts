import { describe, expect, it } from "vitest";
import biped from "../../model/biped-power-board.json";
import demo from "../../model/demo-board.json";
import type { Board } from "../../model/board-model";
import { solve } from "../../solver/solve";
import { FREEZE_S, RECOVER_S, nextPhase } from "../robotAnim";
import { isRobotBoard, readRobot } from "../robotState";

function withStalls(refs: string[]): Board {
  const board = structuredClone(biped) as Board;
  board.parts = board.parts.map((p) =>
    p.model?.type === "servo" && refs.includes(p.ref) ? { ...p, model: { ...p.model, stalled: true } } : p);
  return board;
}
const read = (refs: string[]) => {
  const board = withStalls(refs);
  return readRobot(board, solve(board, { modes: {}, outputs: {} }));
};

describe("readRobot", () => {
  it("only the biped board is a robot", () => {
    expect(isRobotBoard(biped as Board)).toBe(true);
    expect(isRobotBoard(demo as Board)).toBe(false);
  });

  it("walks with no stalls", () => {
    expect(read([])).toMatchObject({ state: "walking", stalled: [] });
  });

  it("limps with one stall while the rail holds", () => {
    const r = read(["J2"]);
    expect(r?.state).toBe("limping");
    expect(r?.stalled).toEqual(["J2"]);
    expect(r!.rail!.volts).toBeGreaterThanOrEqual(r!.rail!.minVolts);
  });

  it("browns out once the rail sags below its limit", () => {
    const r = read(["J2", "J3"]);
    expect(r?.state).toBe("brownout");
    expect(r!.rail!.volts).toBeLessThan(r!.rail!.minVolts);
  });

  it("reads stalls from the solution, not the stalled flag", () => {
    const board = withStalls([]);
    const sim = solve(withStalls(["J4"]), { modes: {}, outputs: {} });
    expect(readRobot(board, sim)?.stalled).toEqual(["J4"]);
  });
});

describe("nextPhase", () => {
  it("freezes, then collapses after the freeze time", () => {
    expect(nextPhase("walk", 0, "brownout")).toBe("freeze");
    expect(nextPhase("freeze", FREEZE_S / 2, "brownout")).toBe("freeze");
    expect(nextPhase("freeze", FREEZE_S, "brownout")).toBe("collapse");
    expect(nextPhase("collapse", 10, "brownout")).toBe("collapse");
  });

  it("gets up, then resumes the gait the solver calls for", () => {
    expect(nextPhase("collapse", 0, "walking")).toBe("recover");
    expect(nextPhase("recover", RECOVER_S / 2, "walking")).toBe("recover");
    expect(nextPhase("recover", RECOVER_S, "walking")).toBe("walk");
    expect(nextPhase("recover", RECOVER_S, "limping")).toBe("limp");
    expect(nextPhase("freeze", 0.1, "limping")).toBe("limp");
    expect(nextPhase("walk", 0, "limping")).toBe("limp");
  });
});
