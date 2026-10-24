import { describe, expect, it } from "vitest";
import process from "node:process";
import type { Board, BranchCurrent, McuState, SimResult } from "../../model/board-model";
import { dividerBoard, demoBoard, d8High, d8Low, noOutputs } from "./fixtures";

// This comparison uses SPICE sources for the solver's specified piecewise-linear
// LED and saturated NPN models, rather than a vendor transistor's nonlinear curve.
const runNgspice = process.env.RUN_NGSPICE === "1" ? describe : describe.skip;

async function loadSolver(): Promise<(board: Board, mcu: McuState) => SimResult> {
  // Keep the skipped optional suite collectable before solve.ts is implemented.
  const modulePath = "../solve";
  const module = await import(/* @vite-ignore */ modulePath) as { solve: (board: Board, mcu: McuState) => SimResult };
  return module.solve;
}

async function operatingPoint(netlist: string): Promise<Record<string, number>> {
  const { Simulation } = await import("eecircuit-engine");
  const sim = new Simulation();
  await sim.start();
  sim.setNetList(netlist);
  const result = await sim.runSim();
  const errors = sim.getError();
  expect(errors, `ngspice errors: ${errors.join("; ")}`).toEqual([]);
  expect(result.dataType).toBe("real");
  if (result.dataType !== "real") throw new Error("Expected real operating-point vectors");
  expect(result.numPoints).toBe(1);
  return Object.fromEntries(result.data.map((vector) => {
    const value = vector.values[0];
    if (value === undefined) throw new Error(`Missing ngspice value for ${vector.name}`);
    return [vector.name.toLowerCase(), value];
  }));
}

function requiredVoltage(result: SimResult, netId: string): number {
  const value = result.netVoltages[netId];
  if (value === undefined) throw new Error(`Missing solver voltage for ${netId}`);
  return value;
}

function requiredVector(vectors: Record<string, number>, name: string): number {
  const value = vectors[name];
  if (value === undefined) throw new Error(`Missing ngspice vector ${name}`);
  return value;
}

function withinTwoPercent(actual: number, reference: number): void {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - reference)).toBeLessThanOrEqual(Math.abs(reference) * 0.02);
}

runNgspice("solver versus ngspice WASM", () => {
  it("agrees on the 10k/10k divider", async () => {
    const vectors = await operatingPoint(`Divider comparison
V1 vcc 0 DC 5
R1 vcc mid 10k
R2 mid 0 10k
.op
.end`);
    const solve = await loadSolver();
    const result = solve(dividerBoard(), noOutputs);
    expect(result.ok).toBe(true);
    withinTwoPercent(requiredVoltage(result, "MID"), requiredVector(vectors, "v(mid)"));
    withinTwoPercent(result.branches.find((branch: BranchCurrent) => branch.ref === "R1")!.amps, Math.abs(requiredVector(vectors, "i(v1)")));
  });

  it.each([false, true])("agrees on the demo board with D8 HIGH = %s", async (high) => {
    const vectors = await operatingPoint(`Demo comparison
V1 vcc 0 DC 5
Vdrive drive 0 DC ${high ? 5 : 0}
Rout drive d8 25
R1 d8 base 1000
${high ? "Vbe base 0 DC 0.7" : "Rbase base 0 1g"}
R2 vcc led_a 220
Vled led_a led_r DC 2
Rled led_r collector 10
${high ? "Vce collector 0 DC 0.2" : "Rcollector collector 0 1g"}
Rpot_a vcc a0 5000
Rpot_b a0 0 5000
Rinput a0 0 1meg
.op
.end`);
    const solve = await loadSolver();
    const result = solve(demoBoard(), high ? d8High : d8Low);
    expect(result.ok).toBe(true);
    withinTwoPercent(requiredVoltage(result, "A0"), requiredVector(vectors, "v(a0)"));
    const ledAmps = result.branches.find((branch: BranchCurrent) => branch.ref === "D1")!.amps;
    if (high) {
      withinTwoPercent(ledAmps, Math.abs(requiredVector(vectors, "i(vled)")));
      withinTwoPercent(result.branches.find((branch: BranchCurrent) => branch.ref === "R1")!.amps, Math.abs(requiredVector(vectors, "i(vbe)")));
      expect(result.deviceStates.Q1).toBe("saturated");
    } else {
      expect(ledAmps).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(requiredVector(vectors, "i(vled)"))).toBeLessThanOrEqual(1e-6);
      expect(result.deviceStates.Q1).toBe("cutoff");
    }
  });
});
