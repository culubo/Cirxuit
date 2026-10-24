import { describe, expect, it } from "vitest";
import { formatEngineering, parseEngineering } from "../parse-eng";

describe("parseEngineering", () => {
  it("parses plain decimals", () => {
    expect(parseEngineering("220")).toBe(220);
    expect(parseEngineering("4.7")).toBeCloseTo(4.7, 10);
    expect(parseEngineering(".5")).toBeCloseTo(0.5, 10);
  });

  it("parses SI suffixes", () => {
    expect(parseEngineering("4.7k")).toBeCloseTo(4700, 6);
    expect(parseEngineering("1M")).toBe(1e6);
    expect(parseEngineering("100n")).toBeCloseTo(100e-9, 18);
    expect(parseEngineering("1u")).toBeCloseTo(1e-6, 12);
    expect(parseEngineering("1p")).toBeCloseTo(1e-12, 24);
    expect(parseEngineering("2G")).toBe(2e9);
  });

  it("distinguishes milli (m) from mega (M)", () => {
    expect(parseEngineering("1m")).toBeCloseTo(1e-3, 9);
    expect(parseEngineering("1M")).toBe(1e6);
    expect(parseEngineering("1m")).not.toBe(parseEngineering("1M"));
  });

  it("treats k and K as kilo", () => {
    expect(parseEngineering("2k")).toBe(2000);
    expect(parseEngineering("2K")).toBe(2000);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseEngineering("  220  ")).toBe(220);
    expect(parseEngineering("4.7 k")).toBeCloseTo(4700, 6);
  });

  it("rejects invalid input", () => {
    expect(parseEngineering("")).toBeNull();
    expect(parseEngineering("   ")).toBeNull();
    expect(parseEngineering("-5")).toBeNull();
    expect(parseEngineering("abc")).toBeNull();
    expect(parseEngineering("1.2.3")).toBeNull();
    expect(parseEngineering("10x")).toBeNull();
    expect(parseEngineering("k")).toBeNull();
    expect(parseEngineering("NaN")).toBeNull();
  });
});

describe("formatEngineering", () => {
  it("round-trips common values", () => {
    expect(formatEngineering(220)).toBe("220");
    expect(formatEngineering(4700)).toBe("4.7k");
    expect(formatEngineering(1e6)).toBe("1M");
    expect(formatEngineering(100e-9)).toBe("100n");
    expect(formatEngineering(0)).toBe("0");
  });

  it("produces strings that parse back to the same value", () => {
    for (const v of [220, 4700, 1e6, 100e-9, 2.2e3, 0.001]) {
      expect(parseEngineering(formatEngineering(v))).toBeCloseTo(v, 12);
    }
  });
});
