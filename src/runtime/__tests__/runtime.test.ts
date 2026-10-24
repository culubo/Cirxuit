import { describe, expect, it } from "vitest";
import type { BranchCurrent, SimResult } from "../../model/board-model";
import { demoBoard } from "../../solver/__tests__/fixtures";
import { createRuntime } from "../runtime";

function current(result: SimResult, ref: string): number {
  const branch: BranchCurrent | undefined = result.branches.find((entry) => entry.ref === ref);
  if (!branch) throw new Error(`Missing current for ${ref}`);
  return branch.amps;
}

describe("Arduino-style code runtime", () => {
  it("drives D8 HIGH and lights D1 at about 12.2 mA", async () => {
    const result = await createRuntime(demoBoard()).run("digitalWrite(8, HIGH)");
    expect(result.error).toBeUndefined();
    expect(result.mcuState.modes.D8).toBe("output");
    expect(result.mcuState.outputs.D8).toBe(1);
    expect(result.simResult.ok).toBe(true);
    expect(current(result.simResult, "D1")).toBeGreaterThanOrEqual(0.0122 * 0.95);
    expect(current(result.simResult, "D1")).toBeLessThanOrEqual(0.0122 * 1.05);
  });

  it.each([
    ["digitalWrite(8, HIGH)", 1],
    ["digitalWrite(8, \"HIGH\")", 1],
    ["digitalWrite(8, 1)", 1],
    ["digitalWrite(\"D8\", HIGH)", 1],
    ["digitalWrite(8, LOW)", 0],
    ["digitalWrite(8, \"LOW\")", 0],
    ["digitalWrite(8, 0)", 0],
    ["digitalWrite(\"D8\", LOW)", 0],
  ] as const)("normalizes pin and level in %s", async (code, level) => {
    const result = await createRuntime(demoBoard()).run(code);
    expect(result.error).toBeUndefined();
    expect(result.mcuState.modes.D8).toBe("output");
    expect(result.mcuState.outputs.D8).toBe(level);
    expect(result.mcuState.outputs["8"]).toBeUndefined();
  });

  it("returns the pot midpoint through a 10-bit analogRead", async () => {
    const result = await createRuntime(demoBoard()).run('log(analogRead("A0"))');
    expect(result.error).toBeUndefined();
    expect(result.simResult.ok).toBe(true);
    const logged = result.logs.at(-1);
    expect(logged).toBeDefined();
    const reading = Number(logged);
    expect(Number.isInteger(reading)).toBe(true);
    expect(reading).toBeGreaterThanOrEqual(510);
    expect(reading).toBeLessThanOrEqual(514);
  });

  it("stops an infinite loop within 500 ms and returns a friendly error", async () => {
    const runtime = createRuntime(demoBoard());
    const started = performance.now();
    const result = await Promise.race([
      runtime.run("while(true){}"),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Runtime did not stop the loop")), 1_000)),
    ]);
    expect(performance.now() - started).toBeLessThanOrEqual(500);
    expect(result.error).toMatch(/time(?:d)? out|infinite loop|execution limit|stopp?ed|abort/i);
    expect(result.simResult).toBeDefined();
  }, 2_000);

  it("reports a thrown error and rolls back state changes from that run", async () => {
    const runtime = createRuntime(demoBoard());
    const before = await runtime.run("digitalWrite(8, HIGH)");
    expect(before.error).toBeUndefined();

    const after = await runtime.run('digitalWrite(8, LOW); throw new Error("boom")');
    expect(after.error).toContain("boom");
    expect(after.mcuState).toEqual(before.mcuState);
    expect(after.simResult).toEqual(before.simResult);
  });

  it("names an unknown pin in its error", async () => {
    const result = await createRuntime(demoBoard()).run("digitalWrite(99, HIGH)");
    expect(result.error).toMatch(/\b(?:D)?99\b/);
    expect(result.error).toMatch(/unknown|not found|does not exist|invalid|unavailable/i);
  });
});
