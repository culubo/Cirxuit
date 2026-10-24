/**
 * Engineering-notation parsing for editable electrical parameters.
 *
 * Accepts plain decimals and SI-suffixed values. Rejects negatives, empty, and
 * anything that is not a single number with an optional single SI suffix.
 *
 * SI suffixes (case matters for m vs M, per SI):
 *   p = 1e-12   n = 1e-9   u = 1e-6   m = 1e-3
 *   k = 1e3     K = 1e3    M = 1e6    G = 1e9
 */

const MULTIPLIERS: Record<string, number> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
};

/**
 * Parse an engineering-notation string to a non-negative finite number.
 * Returns null for invalid input (negative, empty, non-numeric, bad grammar).
 */
export function parseEngineering(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  // Optional leading +, digits with optional single decimal point, optional
  // single SI suffix. No leading minus — negative values are invalid here.
  const match = /^\+?(\d+(?:\.\d+)?|\.\d+)\s*([pnumkKMG]?)$/.exec(trimmed);
  if (!match) return null;

  const mantissa = Number(match[1]);
  if (!Number.isFinite(mantissa)) return null;

  const suffix = match[2] ?? "";
  const mult = suffix === "" ? 1 : MULTIPLIERS[suffix];
  if (mult === undefined) return null;

  const value = mantissa * mult;
  return Number.isFinite(value) ? value : null;
}

/**
 * Render a number as a compact engineering-notation string for display.
 * Chooses the suffix that yields a mantissa in [1, 1000) where possible.
 */
export function formatEngineering(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value === 0) return "0";

  const steps: { suffix: string; factor: number }[] = [
    { suffix: "G", factor: 1e9 },
    { suffix: "M", factor: 1e6 },
    { suffix: "k", factor: 1e3 },
    { suffix: "", factor: 1 },
    { suffix: "m", factor: 1e-3 },
    { suffix: "u", factor: 1e-6 },
    { suffix: "n", factor: 1e-9 },
    { suffix: "p", factor: 1e-12 },
  ];

  for (const { suffix, factor } of steps) {
    if (value >= factor) {
      const mantissa = value / factor;
      // Trim trailing zeros: 4.70 -> 4.7, 220.0 -> 220
      const text = Number(mantissa.toPrecision(4)).toString();
      return `${text}${suffix}`;
    }
  }
  // Smaller than a pico — fall back to a precise string.
  return value.toString();
}
