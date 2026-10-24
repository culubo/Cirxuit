/**
 * worker.ts — browser module Worker entry point.
 *
 * Created with:
 *   new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
 *
 * It receives a WorkerRequest, runs executeProgram (which calls solve() directly),
 * and posts back a WorkerResponse.  The 500 ms timeout is enforced by the main
 * thread via worker.terminate(); this file has no timing logic of its own.
 */

import type { Board, McuState } from "../model/board-model";
import { executeProgram, type ExecuteResult } from "./execute";

export interface WorkerRequest {
  code: string;
  board: Board;
  mcuState: McuState;
}

export type WorkerResponse = ExecuteResult;

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
