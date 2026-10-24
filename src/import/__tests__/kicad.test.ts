import { describe, expect, it } from "vitest";
import { parseKiCadPcb, parseSExpressions } from "../kicad";

const pcb = `(kicad_pcb (version 20240108) (generator "pcbnew")
  (general (thickness 1.2))
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user))
  (net 0 "") (net 1 "GND") (net 2 "+5V")
  (gr_line (start 20 10) (end 20 20) (stroke (width 0.05) (type default)) (layer "Edge.Cuts"))
  (gr_line (start 10 20) (end 10 10) (layer "Edge.Cuts"))
  (gr_line (start 20 20) (end 10 20) (layer "Edge.Cuts"))
  (gr_line (start 10 10) (end 20 10) (layer "Edge.Cuts"))
  (footprint "Resistor_SMD:R_0805" (layer "F.Cu") (at 12 14 90)
    (property "Reference" "R1") (property "Value" "1k")
    (pad "1" smd rect (at -1 0) (size 1.2 0.8) (layers "F.Cu") (net 2 "+5V"))
    (pad "2" smd rect (at 1 0) (size 1.2 0.8) (layers "F.Cu") (net 1 "GND")))
  (footprint "Connector_Generic:Conn_01x01" (layer "B.Cu") (at 18 16)
    (fp_text reference "J1" (at 0 0)) (fp_text value "Test Pad" (at 0 1))
    (pad "1" thru_hole circle (at 0 0) (size 1.7 1.7) (drill 1) (layers "*.Cu" "*.Mask") (net 1 "GND")))
  (segment (start 12 13) (end 18 16) (width 0.25) (layer "F.Cu") (net 2))
  (via (at 18 16) (size 0.8) (drill 0.4) (layers "F.Cu" "B.Cu") (net 1)))`;

describe("KiCad S-expression parser", () => {
  it("parses quoted and escaped atoms and rejects malformed input", () => {
    expect(parseSExpressions('(root "A \\"quote\\"" (child 2))')).toEqual([["root", 'A "quote"', ["child", "2"]]]);
    expect(parseSExpressions('(root "(" ")")')).toEqual([["root", "(", ")"]]);
    expect(() => parseSExpressions("(root (child)")).toThrow(/Unclosed/);
    expect(() => parseSExpressions("(root))")).toThrow(/Unexpected/);
  });

  it("imports geometry, connectivity, and unknown parts from a KiCad 8 board", () => {
    const board = parseKiCadPcb(pcb, "Fixture board");
    expect(board.name).toBe("Fixture board");
    expect(board.thicknessMm).toBe(1.2);
    expect(board.outline).toHaveLength(5);
    expect(board.outline[0]).toEqual(board.outline.at(-1));
    expect(new Set(board.outline.map((p) => `${p.x},${p.y}`))).toEqual(new Set(["10,10", "20,10", "20,20", "10,20"]));
    expect(board.copperLayers).toEqual(["F.Cu", "B.Cu"]);
    expect(board.groundNetId).toBe("1");
    expect(board.parts).toHaveLength(2);
    expect(board.parts[0]).toMatchObject({ ref: "R1", value: "1k", kind: "unknown", side: "top", rotationDeg: 90 });
    expect(board.parts[0]!.model).toBeUndefined();
    expect(board.parts[0]!.pads).toMatchObject([
      { number: "1", netId: "2", position: { x: 12, y: 15 }, sizeMm: { w: 1.2, h: 0.8 }, layers: ["F.Cu"] },
      { number: "2", netId: "1", position: { x: 12, y: 13 }, layers: ["F.Cu"] },
    ]);
    expect(board.parts[1]).toMatchObject({ ref: "J1", value: "Test Pad", kind: "unknown", side: "bottom" });
    expect(board.parts[1]!.pads[0]!.layers).toEqual(["F.Cu", "B.Cu"]);
    expect(board.nets).toMatchObject([
      { id: "1", name: "GND", pads: [{ ref: "R1", pad: "2" }, { ref: "J1", pad: "1" }] },
      { id: "2", name: "+5V", pads: [{ ref: "R1", pad: "1" }] },
    ]);
    expect(board.tracks).toEqual([{ netId: "2", layer: "F.Cu", start: { x: 12, y: 13 }, end: { x: 18, y: 16 }, widthMm: 0.25 }]);
    expect(board.vias).toEqual([{ netId: "1", position: { x: 18, y: 16 }, drillMm: 0.4, diameterMm: 0.8 }]);
    expect(board.blocks).toEqual([]);
  });

  it("supports rectangle and arc outlines", () => {
    const rectangle = parseKiCadPcb('(kicad_pcb (gr_rect (start 0 0) (end 10 5) (layer "Edge.Cuts")))');
    expect(rectangle.outline).toHaveLength(5);
    const arc = parseKiCadPcb(`(kicad_pcb
      (gr_arc (start 0 0) (mid 5 -5) (end 10 0) (layer "Edge.Cuts"))
      (gr_line (start 10 0) (end 10 10) (layer "Edge.Cuts"))
      (gr_line (start 10 10) (end 0 10) (layer "Edge.Cuts"))
      (gr_line (start 0 10) (end 0 0) (layer "Edge.Cuts")))`);
    expect(arc.outline.length).toBeGreaterThan(5);
    expect(arc.outline.some((p) => Math.abs(p.x - 5) < 1e-6 && Math.abs(p.y + 5) < 1e-6)).toBe(true);
  });
});
