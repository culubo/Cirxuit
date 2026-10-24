import { describe, expect, it } from "vitest";
import type { Board, BranchCurrent, Part, SimResult } from "../../model/board-model";
import { solve } from "../solve";
import { board, d8High, d8Low, demoBoard, noOutputs, part, sourceResistorBoard } from "./fixtures";

function requirePart(boardToCheck: Board, ref: string): Part {
  const found = boardToCheck.parts.find((candidate) => candidate.ref === ref);
  if (!found) throw new Error(`Fixture is missing ${ref}`);
  return found;
}

function requireBranch(result: SimResult, ref: string, fromPad?: string): BranchCurrent {
  const found = result.branches.find((branch) => branch.ref === ref &&
    (fromPad === undefined || branch.fromPad === fromPad));
  if (!found) throw new Error(`Result is missing ${ref}${fromPad ? ` from ${fromPad}` : ""} current`);
  return found;
}

function requireVoltage(result: SimResult, netId: string): number {
  const volts = result.netVoltages[netId];
  if (volts === undefined) throw new Error(`Result is missing ${netId} voltage`);
  return volts;
}

describe("solver review findings", () => {
  it("keeps Q1 cut off with a 9k/1k base divider and a 1k collector load", () => {
    const circuit = board([
      part("J1", "vsource", { type: "vsource", volts: 5, posPad: "+", negPad: "-" }, [["+", "+5V"], ["-", "GND"]]),
      part("RB1", "resistor", { type: "resistor", ohms: 9000 }, [["1", "+5V"], ["2", "Q1_B"]]),
      part("RB2", "resistor", { type: "resistor", ohms: 1000 }, [["1", "Q1_B"], ["2", "GND"]]),
      part("RC", "resistor", { type: "resistor", ohms: 1000 }, [["1", "+5V"], ["2", "Q1_C"]]),
      part("Q1", "npn", {
        type: "npn", beta: 100, vbe: 0.7, vceSat: 0.2,
        basePad: "B", collectorPad: "C", emitterPad: "E",
      }, [["B", "Q1_B"], ["C", "Q1_C"], ["E", "GND"]]),
    ], "GND", "base-divider-review");

    const result = solve(circuit, noOutputs);
    expect.soft(result.ok).toBe(true);
    expect.soft(result.deviceStates.Q1).toBe("cutoff");
    expect.soft(requireVoltage(result, "Q1_C")).toBeCloseTo(5, 6);
  });

  it("limits collector current to beta times base current with R1=100k and D1 vf=3.0", () => {
    const circuit = demoBoard();
    const r1 = requirePart(circuit, "R1");
    const d1 = requirePart(circuit, "D1");
    const q1 = requirePart(circuit, "Q1");
    if (r1.model?.type !== "resistor" || d1.model?.type !== "led" || q1.model?.type !== "npn") {
      throw new Error("Demo fixture models changed");
    }
    r1.model.ohms = 100_000;
    d1.model.vf = 3.0;

    const result = solve(circuit, d8High);
    const ib = requireBranch(result, "Q1", "B").amps;
    const ic = requireBranch(result, "Q1", "C").amps;
    expect.soft(result.ok).toBe(true);
    expect.soft(result.deviceStates.Q1).not.toBe("saturated");
    expect.soft(ic).toBeLessThanOrEqual(q1.model.beta * ib + 1e-9);
  });

  it("passes no current through an LED with an unconnected cathode pad", () => {
    const circuit = demoBoard();
    const cathode = requirePart(circuit, "D1").pads.find((pad) => pad.number === "K");
    if (!cathode) throw new Error("Demo fixture is missing D1 cathode");
    cathode.netId = null;
    const collectorNet = circuit.nets.find((net) => net.id === "Q1_C");
    if (collectorNet) collectorNet.pads = collectorNet.pads.filter((use) => !(use.ref === "D1" && use.pad === "K"));

    const result = solve(circuit, d8High);
    expect(requireBranch(result, "D1").amps).toBe(0);
  });

  it("reports a zero-ohm source load as a short without non-finite numbers", () => {
    const circuit = sourceResistorBoard();
    const r1 = requirePart(circuit, "R1");
    if (r1.model?.type !== "resistor") throw new Error("Fixture R1 is not a resistor");
    r1.model.ohms = 0;

    const result = solve(circuit, noOutputs);
    expect(result.ok === false || result.warnings.some((warning) => /short/i.test(warning.message))).toBe(true);
    for (const [netId, volts] of Object.entries(result.netVoltages)) {
      expect(Number.isFinite(volts), `non-finite voltage at ${netId}: ${volts}`).toBe(true);
    }
    for (const branch of result.branches) {
      expect(Number.isFinite(branch.amps), `non-finite current in ${branch.ref}: ${branch.amps}`).toBe(true);
    }
    expect(Number.isFinite(result.iterations)).toBe(true);
  });

  it("solves a DC-open capacitor whose second pad is on an otherwise empty net", () => {
    const circuit = board([
      part("J1", "vsource", { type: "vsource", volts: 5, posPad: "+", negPad: "-" }, [["+", "+5V"], ["-", "GND"]]),
      part("C1", "capacitor", { type: "capacitor", farads: 100e-9 }, [["1", "+5V"], ["2", "EMPTY"]]),
    ], "GND", "open-capacitor-review");

    const result = solve(circuit, noOutputs);
    expect(result.ok).toBe(true);
  });

  it("tells users to increase R2 for overcurrent and names the actual MCU ref", () => {
    const overcurrent = solve(demoBoard({ r2Ohms: 10 }), d8High);
    const ledWarning = overcurrent.warnings.find((warning) => warning.ref === "D1" && /current|rating/i.test(warning.message));
    expect.soft(ledWarning, "D1 overcurrent warning is missing").toBeDefined();
    expect.soft(ledWarning?.message).toMatch(/increase/i);
    expect.soft(ledWarning?.message).not.toMatch(/reduce/i);

    const circuit = demoBoard({ floatingInput: true });
    requirePart(circuit, "U1").ref = "MCU7";
    for (const net of circuit.nets) {
      for (const use of net.pads) if (use.ref === "U1") use.ref = "MCU7";
    }
    const floating = solve(circuit, d8Low);
    const mcuWarning = floating.warnings.find((warning) => warning.ref === "MCU7" && /float|undriven/i.test(warning.message));
    expect.soft(mcuWarning, "MCU floating-input warning is missing").toBeDefined();
    expect.soft(mcuWarning?.message).toContain("MCU7");
    expect.soft(mcuWarning?.message).not.toMatch(/\bU1\b/);
  });
});
