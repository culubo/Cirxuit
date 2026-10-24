import { describe, expect, it } from "vitest";
import { shortValue } from "../geometry";
import { schematicFade } from "../SchematicOverlay";

describe("shortValue", () => {
  it("keeps short values as they are", () => {
    expect(shortValue("220")).toBe("220");
    expect(shortValue("ATmega328P")).toBe("ATmega328P");
    expect(shortValue(undefined)).toBe("");
  });

  it("drops a parenthetical when the main text fits", () => {
    expect(shortValue("servo (run 25 Ω / stall 3 Ω)")).toBe("servo");
  });

  it("falls back to the parenthetical when the main text is long", () => {
    expect(shortValue("battery internal resistance (0.3 Ω)")).toBe("0.3 Ω");
  });

  it("cuts at a word boundary", () => {
    expect(shortValue("50 Ω controller")).toBe("50 Ω");
    expect(shortValue("0.05 Ω fuse")).toBe("0.05 Ω fuse");
  });

  it("hard-truncates a single long word", () => {
    expect(shortValue("Supercalifragilistic")).toBe("Supercalifr…");
  });
});

describe("schematicFade", () => {
  it("is hidden at or below 0.6 and fully visible at 1.0", () => {
    expect(schematicFade(0)).toBe(0);
    expect(schematicFade(0.6)).toBe(0);
    expect(schematicFade(1)).toBe(1);
  });

  it("rises monotonically in between", () => {
    const a = schematicFade(0.7), b = schematicFade(0.8), c = schematicFade(0.9);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(c).toBeLessThan(1);
  });
});
