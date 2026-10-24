import { describe, expect, it } from "vitest";
import demo from "../../model/demo-board.json";
import biped from "../../model/biped-power-board.json";
import type { Board } from "../../model/board-model";
import { chipSize, landPattern, packageFamily, qfpGeometry, qfpPins, resistorCode, toBoard, toLocal } from "../footprint";

const demoBoard = demo as Board;
const bipedBoard = biped as Board;
const part = (board: Board, ref: string) => {
  const found = board.parts.find((p) => p.ref === ref);
  if (!found) throw new Error(`missing ${ref}`);
  return found;
};

describe("package classification", () => {
  it("maps every built-in part to a real package model", () => {
    for (const board of [demoBoard, bipedBoard]) {
      for (const p of board.parts) expect(packageFamily(p), p.ref).not.toBe("generic");
    }
  });

  it("reads real EIA chip sizes from the metric code", () => {
    expect(chipSize(part(demoBoard, "R1"))).toMatchObject({ length: 1.6, width: 0.8 });
    expect(chipSize(part(demoBoard, "D1"))).toMatchObject({ length: 2, width: 1.25 });
    expect(chipSize(part(bipedBoard, "RINT"))).toMatchObject({ length: 3.2, width: 1.6 });
  });
});

describe("QFP land pattern", () => {
  it("numbers TQFP-32 pins counter-clockwise from the top of the left side", () => {
    const pins = qfpPins(qfpGeometry(part(demoBoard, "U1")));
    expect(pins).toHaveLength(32);
    expect(pins[0]?.local.x).toBeCloseTo(-4.16);
    expect(pins[0]?.local.y).toBeCloseTo(-2.8);
    expect(pins[8]?.local.y).toBeCloseTo(4.16);   // pin 9 starts the bottom side
    expect(pins[16]?.local.y).toBeCloseTo(2.8);   // pin 17 is the bottom of the right side
  });

  it("fills in the unconnected lands around the netted pads", () => {
    const u1 = part(demoBoard, "U1");
    const lands = landPattern(u1);
    expect(lands).toHaveLength(32);
    expect(lands.filter((l) => l.netId !== null)).toHaveLength(u1.pads.length);
  });

  it("puts every netted U1 pad on a real 0.8 mm lead position", () => {
    for (const board of [demoBoard, bipedBoard]) {
      const u1 = part(board, "U1");
      const pins = qfpPins(qfpGeometry(u1)).map((pin) => toBoard(u1, pin.local));
      for (const pad of u1.pads) {
        const nearest = Math.min(...pins.map((p) => Math.hypot(p.x - pad.position.x, p.y - pad.position.y)));
        expect(nearest, `${board.id} U1.${pad.number}`).toBeLessThan(0.01);
      }
    }
  });
});

describe("transforms", () => {
  it("round-trips board and local coordinates under rotation", () => {
    const c1 = part(demoBoard, "C1");
    const local = { x: 0.8, y: -0.3 };
    const back = toLocal(c1, toBoard(c1, local));
    expect(back.x).toBeCloseTo(local.x);
    expect(back.y).toBeCloseTo(local.y);
  });
});

describe("resistor marking", () => {
  it("uses the EIA 3-digit code", () => {
    expect(resistorCode(1000)).toBe("102");
    expect(resistorCode(220)).toBe("221");
    expect(resistorCode(10)).toBe("100");
    expect(resistorCode(4.7)).toBe("4R7");
    expect(resistorCode(0.3)).toBe("R30");
  });
});
