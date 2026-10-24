import { performance } from "node:perf_hooks";
import { describe, it } from "vitest";
import type { Board, McuState, SimResult } from "../../model/board-model";
import { solve } from "../solve";
import { d8High, d8Low, demoBoard } from "./fixtures";

const WIPERS = Array.from({ length: 21 }, (_, step) => Number((step * 0.05).toFixed(2)));
const R2_OHMS = [10, 100, 220, 1000, 10000] as const;
const D8_LEVELS: ReadonlyArray<{ label: string; state: McuState }> = [
  { label: "HIGH", state: d8High },
  { label: "LOW", state: d8Low },
];

function boardAt(wiper: number, r2Ohms: number): Board {
  const board = demoBoard({ r2Ohms });
  const pot = board.parts.find((part) => part.ref === "RV1");
  if (pot?.model?.type !== "potentiometer") throw new Error("Demo fixture is missing RV1's potentiometer model");
  pot.model.wiper = wiper;
  return board;
}

function validateResult(board: Board, result: SimResult, elapsedMs: number): string[] {
  const failures: string[] = [];
  if (!result.ok) failures.push("result.ok is false");
  if (!Number.isFinite(result.iterations) || result.iterations >= 30) {
    failures.push(`iterations=${result.iterations}, expected < 30`);
  }
  if (!Number.isFinite(elapsedMs) || elapsedMs >= 16) {
    failures.push(`solve time=${elapsedMs.toFixed(3)} ms, expected < 16 ms`);
  }

  for (const net of board.nets) {
    const volts = result.netVoltages[net.id];
    if (volts === undefined || !Number.isFinite(volts)) {
      failures.push(`net ${net.id} voltage=${String(volts)}, expected a finite number`);
    }
  }
  for (const [netId, volts] of Object.entries(result.netVoltages)) {
    if (!Number.isFinite(volts)) failures.push(`net ${netId} voltage=${volts}, expected a finite number`);
  }

  const padNets: Map<string, string | null> = new Map(board.parts.flatMap((part) =>
    part.pads.map((pad) => [`${part.ref}:${pad.number}`, pad.netId] as const),
  ));
  const balance: Map<string, number> = new Map(board.nets.map((net) => [net.id, 0] as const));
  for (const branch of result.branches) {
    const label = `${branch.ref} ${branch.fromPad}→${branch.toPad}`;
    if (!Number.isFinite(branch.amps) || branch.amps < 0) {
      failures.push(`branch ${label} current=${branch.amps} A, expected a finite nonnegative number`);
      continue;
    }
    const fromKey = `${branch.ref}:${branch.fromPad}`;
    const toKey = `${branch.ref}:${branch.toPad}`;
    if (!padNets.has(fromKey) || !padNets.has(toKey)) {
      failures.push(`branch ${label} references a pad absent from the board`);
      continue;
    }
    const fromNet = padNets.get(fromKey);
    const toNet = padNets.get(toKey);
    if (fromNet !== null && fromNet !== undefined) {
      balance.set(fromNet, (balance.get(fromNet) ?? 0) - branch.amps);
    }
    if (toNet !== null && toNet !== undefined) {
      balance.set(toNet, (balance.get(toNet) ?? 0) + branch.amps);
    }
  }
  for (const [netId, residual] of balance) {
    if (!Number.isFinite(residual) || Math.abs(residual) > 1e-6) {
      failures.push(`KCL at net ${netId}: residual=${residual} A, expected |residual| ≤ 1e-6 A`);
    }
  }
  return failures;
}

describe("demo board parameter sweep", () => {
  it("solves every wiper, D8, and R2 combination", () => {
    const failures: string[] = [];
    // Warm the module once so the measured interval reflects solve() rather than first-use compilation.
    solve(demoBoard(), d8High);

    for (const wiper of WIPERS) {
      for (const { label, state } of D8_LEVELS) {
        for (const r2Ohms of R2_OHMS) {
          const inputs = `wiper=${wiper.toFixed(2)}, D8=${label}, R2=${r2Ohms} Ω`;
          const board = boardAt(wiper, r2Ohms);
          const started = performance.now();
          let result: SimResult;
          try {
            result = solve(board, state);
          } catch (error) {
            failures.push(`${inputs}: solve threw ${error instanceof Error ? error.message : String(error)}`);
            continue;
          }
          const elapsedMs = performance.now() - started;
          for (const failure of validateResult(board, result, elapsedMs)) {
            failures.push(`${inputs}: ${failure}`);
          }
        }
      }
    }

    if (failures.length) {
      throw new Error(`${failures.length} sweep violation(s) across ${WIPERS.length * D8_LEVELS.length * R2_OHMS.length} combinations:\n${failures.join("\n")}`);
    }
  }, 10_000);
});
