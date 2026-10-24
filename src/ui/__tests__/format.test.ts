import { describe, expect, it } from "vitest";
import { formatAdc, formatQuantity } from "../format";

describe("formatQuantity", () => {
  it.each([
    [0.0122, "A", "12.2 mA"],
    [0.0000025, "A", "2.50 µA"],
    [4.98, "V", "4.98 V"],
    [10000, "Ω", "10.0 kΩ"],
    [0, "A", "0 A"],
    [-0.0122, "A", "-12.2 mA"],
    [-4.98, "V", "-4.98 V"],
    [0.000000001, "V", "1.00 nV"],
    [999.9, "Ω", "1.00 kΩ"],
    [0.5, "W", "500 mW"],
  ] as const)("formats %s %s as %s", (value, unit, expected) => {
    expect(formatQuantity(value, unit)).toBe(expected);
  });

  it("hides sub-nano floating-point noise", () => {
    expect(formatQuantity(3.1e-15, "A")).toBe("0 A");
    expect(formatQuantity(-9.99e-10, "V")).toBe("0 V");
    expect(formatQuantity(-0, "W")).toBe("0 W");
  });

  it("uses an em dash for non-finite values", () => {
    expect(formatQuantity(Number.NaN, "V")).toBe("—");
    expect(formatQuantity(Number.POSITIVE_INFINITY, "A")).toBe("—");
    expect(formatQuantity(Number.NEGATIVE_INFINITY, "Ω")).toBe("—");
  });
});

describe("formatAdc", () => {
  it("shows the reading and full-scale count", () => {
    expect(formatAdc(512, 10)).toBe("512 / 1023");
    expect(formatAdc(0, 8)).toBe("0 / 255");
  });
});
