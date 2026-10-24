import { describe, expect, it } from "vitest";
import { board, demoBoard, part } from "../../../solver/__tests__/fixtures";
import type { Board } from "../../../model/board-model";
import {
  placedPins, rotateLocal, schematicFit, symbolKind, symbolPins, toBoardSpace,
} from "../geometry";

const pinAt = (pins: ReturnType<typeof symbolPins>, pad: string) => pins.find((p) => p.pad === pad)?.local;

describe("symbol pins", () => {
  const demo = demoBoard();
  const get = (ref: string) => demo.parts.find((p) => p.ref === ref)!;

  it("places two-pin parts at ±5 mm", () => {
    expect(symbolPins(get("R1"))).toEqual([
      { pad: "1", local: { x: -5, y: 0 }, label: "" },
      { pad: "2", local: { x: 5, y: 0 }, label: "" },
    ]);
  });

  it("puts an LED's anode on pin 1 and cathode on pin 2", () => {
    const pins = symbolPins(get("D1"));
    expect(pinAt(pins, "A")).toEqual({ x: -5, y: 0 });
    expect(pinAt(pins, "K")).toEqual({ x: 5, y: 0 });
  });

  it("uses the NPN, pot, and source layouts from the spec", () => {
    const npn = symbolPins(get("Q1"));
    expect(pinAt(npn, "B")).toEqual({ x: -4, y: 0 });
    expect(pinAt(npn, "C")).toEqual({ x: 2, y: -5 });
    expect(pinAt(npn, "E")).toEqual({ x: 2, y: 5 });
    const pot = symbolPins(get("RV1"));
    expect(pinAt(pot, "1")).toEqual({ x: -5, y: 0 });
    expect(pinAt(pot, "3")).toEqual({ x: 5, y: 0 });
    expect(pinAt(pot, "2")).toEqual({ x: 0, y: -4 });
    const src = symbolPins(get("J1"));
    expect(pinAt(src, "+")).toEqual({ x: 0, y: -5 });
    expect(pinAt(src, "-")).toEqual({ x: 0, y: 5 });
  });

  it("draws servos at ±4 mm with + on pin 1", () => {
    const servo = part("M1", "servo", { type: "servo", runOhms: 25, stallOhms: 3, stalled: false, posPad: "+", negPad: "-" }, [["+", "V"], ["-", "GND"]]);
    expect(symbolPins(servo)).toEqual([
      { pad: "+", local: { x: -4, y: 0 }, label: "+" },
      { pad: "-", local: { x: 4, y: 0 }, label: "−" },
    ]);
  });

  it("spaces MCU pins 2.54 mm down each side", () => {
    const pins = symbolPins(get("U1")); // VCC, GND, D8, A0
    expect(pins.map((p) => p.pad)).toEqual(["VCC", "GND", "D8", "A0"]);
    expect(pinAt(pins, "VCC")).toEqual({ x: -7.62, y: -1.27 });
    expect(pinAt(pins, "GND")).toEqual({ x: -7.62, y: 1.27 });
    expect(pinAt(pins, "D8")).toEqual({ x: 7.62, y: -1.27 });
    expect(pinAt(pins, "A0")).toEqual({ x: 7.62, y: 1.27 });
    expect(pins.every((p) => p.label === p.pad)).toBe(true);
  });

  it("falls back to a box for unmodelled parts", () => {
    const unknown = { ...get("R1"), kind: "connector" as const };
    expect(symbolKind(unknown)).toBe("box");
  });

  it("rotates pins counter-clockwise on screen, like footprints", () => {
    const r = rotateLocal({ x: 5, y: 0 }, 90);
    expect(r.x).toBeCloseTo(0, 9);
    expect(r.y).toBeCloseTo(-5, 9);
    const placed = placedPins(get("R1"), { x: 10, y: 10 }, 90);
    expect(placed[1]!.at.x).toBeCloseTo(10, 9);
    expect(placed[1]!.at.y).toBeCloseTo(5, 9);
  });
});

describe("schematicFit", () => {
  const withSchematic = (b: Board, w: number, h: number): Board => ({
    ...b,
    outline: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 35 }, { x: 0, y: 35 }],
    schematic: { symbols: [], wires: [], size: { w, h } },
  });

  it("scales uniformly into the outline with a 5 mm margin, centred", () => {
    const b = withSchematic(board([]), 100, 50);
    const fit = schematicFit(b)!;
    // Inner area is 40 × 25; width limits: 40 / 100 = 0.4.
    expect(fit.scale).toBeCloseTo(0.4, 9);
    expect(toBoardSpace(b, fit, { x: 0, y: 0 })).toEqual({ x: 5, y: 17.5 - 10 });
    expect(toBoardSpace(b, fit, { x: 100, y: 50 })).toEqual({ x: 45, y: 17.5 + 10 });
  });

  it("uses the height when it is the tighter fit", () => {
    const fit = schematicFit(withSchematic(board([]), 40, 100))!;
    expect(fit.scale).toBeCloseTo(0.25, 9);
  });

  it("returns null without a schematic", () => {
    expect(schematicFit(board([]))).toBeNull();
  });
});
