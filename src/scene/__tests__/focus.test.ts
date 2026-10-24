import { describe, expect, it } from "vitest";
import { demoBoard } from "../../solver/__tests__/fixtures";
import { focusOf } from "../focus";

describe("focusOf", () => {
  const demo = demoBoard();

  it("is inactive with no target", () => {
    expect(focusOf(demo, null).active).toBe(false);
  });

  it("focuses a part, its non-ground nets, and the parts on them", () => {
    const f = focusOf(demo, { kind: "part", ref: "R1" });
    expect([...f.primaryParts]).toEqual(["R1"]);
    expect([...f.nets].sort()).toEqual(["D8", "Q1_B"]);
    expect([...f.parts].sort()).toEqual(["Q1", "R1", "U1"]);
    expect(f.parts.has("D1")).toBe(false);
  });

  it("falls back to ground when a part has no other net", () => {
    const f = focusOf(demo, { kind: "part", ref: "J1" });
    expect(f.nets.has("+5V")).toBe(true);
    expect(f.nets.has("GND")).toBe(false);
  });

  it("focuses a net and every part touching it", () => {
    const f = focusOf(demo, { kind: "net", netId: "LED_A" });
    expect([...f.primaryNets]).toEqual(["LED_A"]);
    expect(f.primaryParts.size).toBe(0);
    expect([...f.parts].sort()).toEqual(["D1", "R2"]);
  });

  it("ignores unknown targets", () => {
    expect(focusOf(demo, { kind: "part", ref: "Z9" }).active).toBe(false);
    expect(focusOf(demo, { kind: "net", netId: "NOPE" }).active).toBe(false);
  });
});
