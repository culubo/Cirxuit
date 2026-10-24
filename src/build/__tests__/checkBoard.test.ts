import { describe, expect, it } from "vitest";
import { board, demoBoard, part } from "../../solver/__tests__/fixtures";
import { checkBoard } from "../checkBoard";
import demoJson from "../../model/demo-board.json";
import bipedJson from "../../model/biped-power-board.json";
import type { Board } from "../../model/board-model";

describe("checkBoard", () => {
  it("finds nothing wrong with the built-in boards", () => {
    expect(checkBoard(demoJson as Board)).toEqual([]);
    expect(checkBoard(bipedJson as Board)).toEqual([]);
    expect(checkBoard(demoBoard())).toEqual([]);
  });

  it("calls out an empty board with a pointer to Build PCB", () => {
    const [problem] = checkBoard(board([]));
    expect(problem?.severity).toBe("info");
    expect(problem?.message).toMatch(/Build PCB/);
  });

  it("requires a power source", () => {
    const circuit = board([
      part("R1", "resistor", { type: "resistor", ohms: 1000 }, [["1", "A"], ["2", "GND"]]),
    ]);
    expect(checkBoard(circuit).some((p) => /No power source/.test(p.message))).toBe(true);
  });

  it("flags unconnected pads, dangling nets, and a shorted supply", () => {
    const circuit = board([
      part("J1", "vsource", { type: "vsource", volts: 5, posPad: "+", negPad: "-" }, [["+", "GND"], ["-", "GND"]]),
      part("R1", "resistor", { type: "resistor", ohms: 1000 }, [["1", "LONE"], ["2", null]]),
    ]);
    const messages = checkBoard(circuit).map((p) => p.message);
    expect(messages.some((m) => /J1 is shorted/.test(m))).toBe(true);
    expect(messages.some((m) => /R1 pad 2 isn't connected/.test(m))).toBe(true);
    expect(messages.some((m) => /Net LONE only reaches R1 pad 1/.test(m))).toBe(true);
  });

  it("flags an MCU without power", () => {
    const circuit = demoBoard();
    const mcu = circuit.parts.find((p) => p.ref === "U1")!;
    mcu.pads.find((p) => p.number === "VCC")!.netId = null;
    expect(checkBoard(circuit).some((p) => p.ref === "U1" && /no power/.test(p.message))).toBe(true);
  });
});
