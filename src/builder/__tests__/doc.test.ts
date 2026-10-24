import { describe, expect, it } from "vitest";
import { solve } from "../../solver/solve";
import { checkBoard } from "../../build/checkBoard";
import {
  addPart, addWire, blankDoc, blinkStarter, deletePart, docToBoard, isBuilderDoc,
  rotatePart, unwiredPads, padKey, wireRoute,
} from "../doc";

describe("builder document", () => {
  it("numbers refs per prefix and snaps to the grid", () => {
    let doc = blankDoc();
    doc = addPart(doc, "resistor", 10.1, 10.1).doc;
    const second = addPart(doc, "resistor", 20, 20);
    expect(second.ref).toBe("R2");
    expect(second.doc.parts[0]!.x).toBeCloseTo(10.16, 6);
  });

  it("merges wired pads into nets and names ground and supply nets", () => {
    const board = docToBoard(blinkStarter());
    const pad = (ref: string, n: string) => board.parts.find((p) => p.ref === ref)!.pads.find((p) => p.number === n)!;
    expect(pad("J1", "-").netId).toBe("GND");
    expect(pad("D1", "K").netId).toBe("GND");
    expect(pad("U1", "GND").netId).toBe("GND");
    expect(pad("J1", "+").netId).toBe("+5V");
    expect(pad("U1", "VCC").netId).toBe("+5V");
    expect(pad("U1", "D8").netId).toBe(pad("R1", "1").netId);
    expect(pad("R1", "2").netId).toBe(pad("D1", "A").netId);
    expect(pad("U1", "A0").netId).toBeNull();
  });

  it("routes every wire as F.Cu traces that start and end on its pads", () => {
    const board = docToBoard(blinkStarter());
    expect(board.tracks.length).toBeGreaterThanOrEqual(5);
    for (const t of board.tracks) {
      expect(t.layer).toBe("F.Cu");
      expect(t.start.x === t.end.x || t.start.y === t.end.y).toBe(true);
    }
    expect(wireRoute({ x: 0, y: 0 }, { x: 3, y: 4 })).toEqual([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }]);
  });

  it("the blink starter passes the electrical rules check", () => {
    expect(checkBoard(docToBoard(blinkStarter())).filter((p) => p.severity === "error")).toEqual([]);
  });

  it("the blink starter lights the LED when D8 is HIGH", () => {
    const result = solve(docToBoard(blinkStarter()), { modes: { D8: "output" }, outputs: { D8: 1 } });
    expect(result.ok).toBe(true);
    const led = result.branches.find((b) => b.ref === "D1")!;
    // (5 V − 2.0 V) / (25 Ω + 330 Ω + 10 Ω) ≈ 8.2 mA
    expect(led.amps).toBeGreaterThan(0.0078);
    expect(led.amps).toBeLessThan(0.0086);
    expect(result.deviceStates.D1).toBe("on");
  });

  it("rotation moves pads around the part centre", () => {
    let doc = addPart(blankDoc(), "resistor", 20.32, 20.32).doc;
    doc = rotatePart(doc, "R1");
    const pads = docToBoard(doc).parts[0]!.pads;
    expect(pads[0]!.position.x).toBeCloseTo(20.32, 6);
    expect(pads[0]!.position.y).toBeCloseTo(18.82, 6);
  });

  it("deleting a part removes its wires; duplicate and self wires are ignored", () => {
    let doc = blinkStarter();
    const wires = doc.wires.length;
    doc = addWire(doc, { ref: "J1", pad: "+" }, { ref: "U1", pad: "VCC" });
    doc = addWire(doc, { ref: "J1", pad: "+" }, { ref: "J1", pad: "+" });
    expect(doc.wires).toHaveLength(wires);
    doc = deletePart(doc, "R1");
    expect(doc.wires.some((w) => w.a.ref === "R1" || w.b.ref === "R1")).toBe(false);
  });

  it("tracks unwired pads and validates stored documents", () => {
    const doc = addPart(blankDoc(), "led", 10, 10).doc;
    expect(unwiredPads(doc).has(padKey({ ref: "D1", pad: "A" }))).toBe(true);
    expect(isBuilderDoc(doc)).toBe(true);
    expect(isBuilderDoc({ parts: "nope" })).toBe(false);
  });
});
