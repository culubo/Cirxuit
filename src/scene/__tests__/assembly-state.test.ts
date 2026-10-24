import { afterEach, expect, test } from "vitest";
import type { Board } from "../../model/board-model";
import robotBoard from "../../model/robot-controller-board.json";
import { useAssembly } from "../assembly";

afterEach(() => useAssembly.getState().cancel());

test("switching boards cancels the assembly camera's board ownership", () => {
  useAssembly.getState().start(robotBoard as Board);
  expect(useAssembly.getState().boardId).toBe("robot-controller-board");

  useAssembly.getState().cancel();
  expect(useAssembly.getState().boardId).toBeNull();
  expect(useAssembly.getState().startedAt).toBeNull();
});

test("normal build completion retains board ownership for the camera pull-back", () => {
  useAssembly.getState().start(robotBoard as Board);
  useAssembly.getState().finish();
  expect(useAssembly.getState().boardId).toBe("robot-controller-board");
  expect(useAssembly.getState().startedAt).toBeNull();
});
