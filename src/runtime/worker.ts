/**
 * worker.ts — browser module Worker entry point.
 *
 * Created with:
 *   new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
 *
 * On load it posts { type: "ready" } so the main thread can start the 500 ms
 * execution budget only once the module graph has loaded (loading can take
 * longer than the budget on a cold start). It then receives a WorkerRequest,
 * runs executeProgram (which calls solve() directly), and posts back the
 * ExecuteResult. The timeout itself is enforced by the main thread via
 * worker.terminate(); this file has no timing logic of its own.
 */

import type { Board, McuState } from "../model/board-model";
import { executeProgram, type ExecuteResult } from "./execute";

export interface WorkerRequest {
  code: string;
  board: Board;
  mcuState: McuState;
}

export interface WorkerReady {
  type: "ready";
}

export type WorkerResponse = ExecuteResult | WorkerReady;

// Browser Worker global scope.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

ctx.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  const { code, board, mcuState } = event.data;
  const result = executeProgram(code, board, mcuState);
  ctx.postMessage(result);
};

ctx.postMessage({ type: "ready" });
