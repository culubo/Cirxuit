import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateBoard } from "../../../scripts/validate-board";
import type { Board } from "../board-model";

const demoBoardPath = resolve(process.cwd(), "src/model/demo-board.json");
const testIfDemoExists = existsSync(demoBoardPath) ? it : it.skip;

describe("demo board integrity", () => {
  testIfDemoExists("has no board validation violations", () => {
    const board = JSON.parse(readFileSync(demoBoardPath, "utf8")) as Board;
    const violations = validateBoard(board);
    expect(violations, `Board validation failed:\n${violations.map((message) => `- ${message}`).join("\n")}`).toEqual([]);
  });
});
