import { describe, expect, it } from "vitest";
import type { Board, BranchCurrent, SimResult, SimWarning } from "../../model/board-model";
import { solve } from "../solve";
import { d8High, d8Low, demoBoard, dividerBoard, noOutputs, sourceResistorBoard } from "./fixtures";

function voltage(result: SimResult, netId: string): number {
  const value = result.netVoltages[netId];
  if (value === undefined) throw new Error(`Missing voltage for ${netId}`);
  return value;
}

function closeToPercent(actual: number, expected: number, percent = 5): void {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * percent / 100);
}

function branch(result: SimResult, ref: string, fromPad?: string, toPad?: string): BranchCurrent {
  const found = result.branches.find((entry) =>
    entry.ref === ref &&
    (fromPad === undefined || entry.fromPad === fromPad) &&
    (toPad === undefined || entry.toPad === toPad),
  );
  expect(found, `Expected a branch current for ${ref}`).toBeDefined();
  return found!;
}

function warningMentions(result: SimResult, ref: string, pattern: RegExp): void {
  expect(result.warnings.some((warning) =>
    (warning.ref === ref || warning.message.includes(ref)) && pattern.test(warning.message),
  )).toBe(true);
}

function checkKcl(board: Board, result: SimResult): void {
  const balance = new Map(board.nets.map((net) => [net.id, 0]));
  const pads = new Map(board.parts.flatMap((part) =>
    part.pads.map((pad) => [`${part.ref}:${pad.number}`, pad.netId] as const),
  ));
  for (const current of result.branches) {
    expect(Number.isFinite(current.amps)).toBe(true);
    expect(current.amps).toBeGreaterThanOrEqual(0);
    const from = pads.get(`${current.ref}:${current.fromPad}`);
    const to = pads.get(`${current.ref}:${current.toPad}`);
    expect(from, `Unknown source pad ${current.ref}:${current.fromPad}`).toBeDefined();
    expect(to, `Unknown sink pad ${current.ref}:${current.toPad}`).toBeDefined();
    if (from !== null && from !== undefined) balance.set(from, (balance.get(from) ?? 0) - current.amps);
    if (to !== null && to !== undefined) balance.set(to, (balance.get(to) ?? 0) + current.amps);
  }
  for (const [netId, amps] of balance) {
    expect(Math.abs(amps), `KCL failed at ${netId}: ${amps} A`).toBeLessThanOrEqual(1e-6);
  }
}

describe("solve: DC fixtures", () => {
  it("solves a 5 V source and 1 kΩ load", () => {
    const result = solve(sourceResistorBoard(), noOutputs);
    expect(result.ok).toBe(true);
    closeToPercent(voltage(result, "+5V"), 5);
    closeToPercent(branch(result, "R1").amps, 0.005);
  });

  it("solves a 10 kΩ / 10 kΩ voltage divider", () => {
    const result = solve(dividerBoard(), noOutputs);
    expect(result.ok).toBe(true);
    closeToPercent(voltage(result, "MID"), 2.5);
  });

  it("saturates Q1 and drives the LED when D8 is HIGH", () => {
    const result = solve(demoBoard(), d8High);
    expect(result.ok).toBe(true);
    expect(result.deviceStates.Q1).toBe("saturated");
    closeToPercent(branch(result, "D1").amps, 0.0122);
    closeToPercent(branch(result, "R1").amps, 0.0042);
  });

  it("cuts Q1 off and extinguishes the LED when D8 is LOW", () => {
    const result = solve(demoBoard(), d8Low);
    expect(result.ok).toBe(true);
    expect(result.deviceStates.Q1).toBe("cutoff");
    expect(branch(result, "D1").amps).toBeLessThanOrEqual(1e-6);
  });

  it("reads the midpoint of a 10 kΩ potentiometer at A0", () => {
    const result = solve(demoBoard(), d8Low);
    expect(result.ok).toBe(true);
    closeToPercent(voltage(result, "A0"), 2.5);
    const adc = Math.round(voltage(result, "A0") / 5 * (2 ** 10 - 1));
    expect(Math.abs(adc - 512)).toBeLessThanOrEqual(26);
  });

  it("flags a backwards LED and reports no LED current", () => {
    const result = solve(demoBoard({ reverseLed: true }), d8High);
    expect(result.ok).toBe(true);
    expect(branch(result, "D1").amps).toBeLessThanOrEqual(1e-6);
    warningMentions(result, "D1", /reverse|backward|wrong direction/i);
  });

  it("warns of LED overcurrent when R2 is 10 Ω", () => {
    const result = solve(demoBoard({ r2Ohms: 10 }), d8High);
    expect(result.ok).toBe(true);
    warningMentions(result, "D1", /overcurrent|too much current|above|exceed/i);
  });

  it("warns about an undriven MCU input", () => {
    const result = solve(demoBoard({ floatingInput: true }), d8Low);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((warning: SimWarning) =>
      /float|undriven|unconnected/i.test(warning.message) &&
      (warning.ref === "U1" || warning.netId === "FLOAT" || /U1|A0|FLOAT/.test(warning.message)),
    )).toBe(true);
  });

  it("reports nonnegative branch magnitudes and satisfies KCL at every net", () => {
    for (const [board, state] of [
      [sourceResistorBoard(), noOutputs],
      [dividerBoard(), noOutputs],
      [demoBoard(), d8High],
      [demoBoard(), d8Low],
    ] as const) {
      const result = solve(board, state);
      expect(result.ok).toBe(true);
      checkKcl(board, result);
    }
  });
});
