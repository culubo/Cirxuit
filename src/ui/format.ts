export type QuantityUnit = "V" | "A" | "Ω" | "W";

const PREFIXES = [
  { factor: 1e-9, symbol: "n" },
  { factor: 1e-6, symbol: "µ" },
  { factor: 1e-3, symbol: "m" },
  { factor: 1, symbol: "" },
  { factor: 1e3, symbol: "k" },
  { factor: 1e6, symbol: "M" },
  { factor: 1e9, symbol: "G" },
  { factor: 1e12, symbol: "T" },
  { factor: 1e15, symbol: "P" },
  { factor: 1e18, symbol: "E" },
  { factor: 1e21, symbol: "Z" },
  { factor: 1e24, symbol: "Y" },
] as const;

/** Display an electrical quantity with three significant figures and an SI prefix. */
export function formatQuantity(value: number, unit: QuantityUnit): string {
  if (!Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value);
  if (magnitude < 1e-9) return `0 ${unit}`;

  let index = 0;
  for (let i = 1; i < PREFIXES.length; i++) {
    if (magnitude >= PREFIXES[i]!.factor) index = i;
    else break;
  }

  // Rounding 999.9 to three figures should promote it to the next prefix.
  let prefix = PREFIXES[index]!;
  let scaled = magnitude / prefix.factor;
  if (Number(scaled.toPrecision(3)) >= 1000 && index + 1 < PREFIXES.length) {
    prefix = PREFIXES[index + 1]!;
    scaled = magnitude / prefix.factor;
  }
  const sign = value < 0 ? "-" : "";
  return `${sign}${scaled.toPrecision(3)} ${prefix.symbol}${unit}`;
}

/** Show an ADC count alongside the maximum count for its bit depth. */
export function formatAdc(count: number, bits: number): string {
  return `${count} / ${2 ** bits - 1}`;
}
