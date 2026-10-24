/**
 * runtime.ts — stateful runner that executes user code off the main thread.
 *
 * It selects a worker implementation at runtime:
 *   • Browser: a module Worker (new Worker(new URL("./worker.ts", …), { type: "module" })).
 *   • Node (Vitest): a worker_threads Worker running the same executeProgram.
 *
 * Both paths run the identical pure executeProgram(code, board, mcuState) — which
 * calls solve() directly for analogRead, so there is no cross-thread round-trip,
 * no SharedArrayBuffer, and no Atomics anywhere.
 *
 * The 500 ms deadline is enforced purely by terminating the worker; it fires at
 * 460 ms so the resolved Promise is comfortably under the wall-clock limit.
 */

import type { Board, McuState, SimResult } from "../model/board-model";
import { solve } from "../solver/solve";
import type { ExecuteResult } from "./execute";

// ─── public types ──────────────────────────────────────────────────────────────

export interface RunResult {
  mcuState: McuState;
  simResult: SimResult;
  logs: unknown[];
  error?: string;
}

export interface Runtime {
  run(code: string): Promise<RunResult>;
}

interface WorkerRequest {
  code: string;
  board: Board;
  mcuState: McuState;
}

/** Fire before the 500 ms limit so the resolved Promise is measured under 500 ms. */
const TIMEOUT_MS = 460;

/** True when running under Node (Vitest), where DOM Worker is unavailable. */
function isNode(): boolean {
  return typeof process !== "undefined"
    && process.versions != null
    && process.versions.node != null
    && typeof Worker === "undefined";
}

// ─── abstraction over the two worker backends ──────────────────────────────────

interface JobHandle {
  /** Resolves with the worker's ExecuteResult, or rejects if terminated/errored. */
  readonly promise: Promise<ExecuteResult>;
  terminate(): void;
}

/** Browser module Worker backend. */
function runInBrowserWorker(request: WorkerRequest): JobHandle {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const promise = new Promise<ExecuteResult>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<ExecuteResult>): void => resolve(e.data);
    worker.onerror = (e: ErrorEvent): void => reject(new Error(e.message));
  });
  worker.postMessage(request);
  return { promise, terminate: () => worker.terminate() };
}

/** Node worker_threads backend (used by Vitest). */
function runInNodeWorker(request: WorkerRequest): JobHandle {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Worker: NodeWorker } = require("worker_threads") as typeof import("worker_threads");

  // The worker body imports the real executeProgram (no logic duplication) and
  // runs it, posting back the result.  Node's native TypeScript loader strips
  // types but does not rewrite import specifiers, so we register a resolve hook
  // that appends ".ts" to extensionless relative imports — this lets the whole
  // execute → solver import chain load inside a plain worker_threads Worker.
  const bootstrap = /* js */ `
    const { parentPort, workerData } = require("worker_threads");
    const { registerHooks } = require("module");
    registerHooks({
      resolve(spec, ctx, next) {
        if (/^[.][.]?[/]/.test(spec) && !/[.][mc]?[tj]sx?$/.test(spec)) {
          try { return next(spec + ".ts", ctx); } catch { return next(spec, ctx); }
        }
        return next(spec, ctx);
      },
    });
    (async () => {
      const { executeProgram } = await import(${JSON.stringify(executeModuleUrl())});
      const { code, board, mcuState } = workerData;
      const result = executeProgram(code, board, mcuState);
      parentPort.postMessage(result);
    })().catch((err) => {
      parentPort.postMessage({
        mcuState: workerData.mcuState,
        logs: [],
        error: err instanceof Error ? err.message : String(err),
      });
    });
  `;

  const worker = new NodeWorker(bootstrap, { eval: true, workerData: request });
  const promise = new Promise<ExecuteResult>((resolve, reject) => {
    worker.on("message", (msg: ExecuteResult) => resolve(msg));
    worker.on("error", (err: Error) => reject(err));
  });
  return { promise, terminate: () => void worker.terminate() };
}

/**
 * Resolve a file:// URL for execute.ts so the Node worker can import it.
 *
 * Under Vitest, import.meta.url is an http:// dev-server URL that Node's ESM
 * loader rejects, so we build a file URL from the current working directory
 * instead.  This branch only runs under Node (tests); the browser path never
 * calls it.
 */
function executeModuleUrl(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { pathToFileURL } = require("node:url") as typeof import("node:url");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resolve } = require("node:path") as typeof import("node:path");
  return pathToFileURL(resolve(process.cwd(), "src/runtime/execute.ts")).href;
}

// ─── createRuntime ─────────────────────────────────────────────────────────────

export function createRuntime(board: Board): Runtime {
  // Persistent state across runs.
  let mcuState: McuState = { modes: {}, outputs: {} };
  let simResult: SimResult = solve(board, mcuState);

  return {
    run(code: string): Promise<RunResult> {
      // Snapshot for rollback on error / timeout.
      const snapMcu: McuState = {
        modes: { ...mcuState.modes },
        outputs: { ...mcuState.outputs },
      };
      const snapSim = simResult;

      const request: WorkerRequest = { code, board, mcuState: snapMcu };
      const job = isNode() ? runInNodeWorker(request) : runInBrowserWorker(request);

      return new Promise<RunResult>((resolve) => {
        let settled = false;

        const finish = (result: RunResult): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          job.terminate();
          resolve(result);
        };

        const timer = setTimeout(() => {
          finish({
            mcuState: snapMcu,
            simResult: snapSim,
            logs: [],
            error: "Execution timed out — possible infinite loop.",
          });
        }, TIMEOUT_MS);

        job.promise.then(
          (exec: ExecuteResult) => {
            if (exec.error !== undefined) {
              // User code threw — roll back persistent state.
              finish({
                mcuState: snapMcu,
                simResult: snapSim,
                logs: exec.logs,
                error: exec.error,
              });
              return;
            }
            // Success — re-solve with the final state and persist it.
            const newSim = solve(board, exec.mcuState);
            mcuState = exec.mcuState;
            simResult = newSim;
            finish({ mcuState: exec.mcuState, simResult: newSim, logs: exec.logs });
          },
          (err: unknown) => {
            // Worker crashed or was terminated mid-flight — roll back.
            finish({
              mcuState: snapMcu,
              simResult: snapSim,
              logs: [],
              error: err instanceof Error ? err.message : String(err),
            });
          },
        );
      });
    },
  };
}
