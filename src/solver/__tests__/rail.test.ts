import { describe, expect, it } from "vitest";
import type { Board, SimResult } from "../../model/board-model";
import { validateBoard } from "../../../scripts/validate-board";
import { solve } from "../solve";
import { board, noOutputs, part } from "./fixtures";

const RAIL_MESSAGE = "Battery rail is below 6.0 V under load.";

function powerBoard(loadOhms: number, withRailLimit = true): Board {
  const circuit = board([
    part("B1", "vsource", { type: "vsource", volts: 7.4, posPad: "+", negPad: "-" }, [["+", "BAT+"], ["-", "GND"]], "7.4 V"),
    part("RINT", "resistor", { type: "resistor", ohms: 0.3 }, [["1", "BAT+"], ["2", "RAIL"]], "0.3 Ω"),
    ...Array.from({ length: 4 }, (_, index) =>
      part(`RL${index + 1}`, "resistor", { type: "resistor", ohms: loadOhms }, [["1", "RAIL"], ["2", "GND"]], `${loadOhms} Ω`),
    ),
  ], "GND", `power-rail-${loadOhms}-ohm-loads`);
  if (withRailLimit) {
    circuit.railLimits = [{ netId: "RAIL", minVolts: 6.0, message: RAIL_MESSAGE }];
  }
  return circuit;
}

function railVolts(result: SimResult): number {
  const volts = result.netVoltages.RAIL;
  if (volts === undefined) throw new Error("Solver omitted the RAIL net voltage");
  return volts;
}

function expectAbout(actual: number, expected: number): void {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(expected * 0.05);
}

describe("battery rail limits", () => {
  it("keeps the running rail above 6.0 V without a rail warning", () => {
    const result = solve(powerBoard(25), noOutputs);
    expect(result.ok).toBe(true);
    expectAbout(railVolts(result), 7.06);
    expect(result.warnings.some((warning) => warning.netId === "RAIL")).toBe(false);
  });

  it("warns when four stalled 3 Ω loads pull the rail below 6.0 V", () => {
    const result = solve(powerBoard(3), noOutputs);
    expect(result.ok).toBe(true);
    expectAbout(railVolts(result), 5.29);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      netId: "RAIL",
      message: RAIL_MESSAGE,
      severity: expect.stringMatching(/^(warn|danger)$/),
    }));
  });

  it("never emits a rail warning without railLimits", () => {
    const result = solve(powerBoard(3, false), noOutputs);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((warning) => warning.netId === "RAIL")).toBe(false);
  });

  it("rejects rail limits that name a missing net", () => {
    const circuit = powerBoard(25);
    expect(validateBoard(circuit)).toEqual([]);
    circuit.railLimits = [{ netId: "MISSING", minVolts: 6.0, message: RAIL_MESSAGE }];
    expect(validateBoard(circuit)).toContain('Rail limit references missing net "MISSING"');
  });
});
