import { describe, expect, it } from "vitest";
import type { Board, ElectricalModel, PartKind, SimResult } from "../../model/board-model";
import { solve } from "../solve";
import { board, noOutputs, part } from "./fixtures";

function servoBoard(stalled: boolean): Board {
  return board([
    part("BT1", "vsource", { type: "vsource", volts: 7.4, posPad: "+", negPad: "-" }, [["+", "BAT+"], ["-", "GND"]], "7.4 V"),
    part("RINT", "resistor", { type: "resistor", ohms: 0.3 }, [["1", "BAT+"], ["2", "VBAT"]], "0.3 Ω"),
    // The casts bridge the pending shared-contract addition; the runtime object uses its exact planned shape.
    part("J2", "servo" as unknown as PartKind, {
      type: "servo", runOhms: 25, stallOhms: 3, stalled, posPad: "+", negPad: "-",
    } as unknown as ElectricalModel, [["+", "VBAT"], ["-", "GND"]], "servo"),
  ], "GND", "single-servo-power");
}

function servoBranch(result: SimResult): NonNullable<SimResult["branches"][number]> {
  const branch = result.branches.find((candidate) => candidate.ref === "J2");
  if (!branch) throw new Error("Solver omitted the J2 servo branch");
  return branch;
}

function expectAbout(actual: number, expected: number): void {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(expected * 0.02);
}

describe("servo DC load", () => {
  it.each([
    [false, 0.292],
    [true, 2.24],
  ] as const)("draws the expected current when stalled=%s", (stalled, expectedAmps) => {
    const result = solve(servoBoard(stalled), noOutputs);
    expect(result.ok).toBe(true);
    const branch = servoBranch(result);
    expect(branch.ref).toBe("J2");
    expect(branch.fromPad).toBe("+");
    expect(branch.toPad).toBe("-");
    expect(branch.amps).toBeGreaterThanOrEqual(0);
    expectAbout(branch.amps, expectedAmps);
  });

  it("changes only the stalled flag when toggled and never mutates the board while solving", () => {
    const circuit = servoBoard(false);
    const beforeRun = structuredClone(circuit);
    solve(circuit, noOutputs);
    expect(circuit).toEqual(beforeRun);

    const servo = circuit.parts.find((candidate) => candidate.ref === "J2");
    if (!servo?.model || !("stalled" in servo.model)) throw new Error("Fixture is missing the servo model");
    servo.model.stalled = true;
    const afterToggle = structuredClone(circuit);
    solve(circuit, noOutputs);
    expect(circuit).toEqual(afterToggle);

    const expected = structuredClone(beforeRun);
    const expectedServo = expected.parts.find((candidate) => candidate.ref === "J2");
    if (!expectedServo?.model || !("stalled" in expectedServo.model)) throw new Error("Fixture is missing the servo model");
    expectedServo.model.stalled = true;
    expect(afterToggle).toEqual(expected);
  });
});
