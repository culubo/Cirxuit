import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateBoard } from "../../../scripts/validate-board";
import type { Board } from "../board-model";

describe("robot controller board integrity", () => {
  it("has no board validation violations", () => {
    const board = JSON.parse(readFileSync(resolve(process.cwd(), "src/model/robot-controller-board.json"), "utf8")) as Board;
    expect(validateBoard(board)).toEqual([]);
  });
});
