import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateBoard } from "../../../scripts/validate-board";
import type { Board } from "../board-model";

const boardPath = resolve(process.cwd(), "src/model/biped-power-board.json");
const testIfExists = existsSync(boardPath) ? it : it.skip;

describe("biped power board integrity", () => {
  testIfExists("has no board validation violations", () => {
    const board = JSON.parse(readFileSync(boardPath, "utf8")) as Board;
    const violations = validateBoard(board);
    expect(violations, `Board validation failed:\n${violations.map((m) => `- ${m}`).join("\n")}`).toEqual([]);
  });
});
