/**
 * Design tokens — the dark "lab instrument at night" palette.
 *
 * Single source of truth for colour, used by both DOM styles and three.js
 * materials. Prefer referencing a token over a raw hex wherever one exists.
 */

export const tokens = {
  // Surfaces
  bg: "#0b0f14",          // near-black blue-gray background (not pure black)
  panel: "#0d1117",       // inspector / control chrome
  panelBorder: "#243224",
  hairline: "#1a2a1a",

  // Text
  text: "#c8d8c8",
  textDim: "#7a8a7a",
  textFaint: "#5a7a5a",

  // Accents (meaning-carrying)
  phosphor: "#7ec8a0",    // current / selection — phosphor green
  amber: "#e0a84a",       // warnings
  danger: "#d9463b",      // danger

  // Physical materials
  silk: "#e8eef0",        // white silkscreen
  solderMask: "#1a5e20",  // green solder mask
  copper: "#c88a3a",      // copper
  copperBack: "#b05a2a",  // back copper (slightly darker/warmer)
  fr4: "#2a3a20",         // substrate edge

  // Function-block accent tokens (match board JSON `color` fields)
  "accent-power": "#d9a441",
  "accent-mcu": "#5a9bd4",
  "accent-driver": "#7ec8a0",
  "accent-sensor": "#b07ad4",
  "accent-warn": "#e0a84a",
} as const;

export type TokenName = keyof typeof tokens;

const NEUTRAL_BLOCK = "#8a9a8a";

/**
 * Resolve a FunctionBlock.color token (e.g. "accent-power") to a hex string.
 * Unknown tokens fall back to a quiet neutral so the UI never shows a raw token.
 */
export function blockColor(token: string): string {
  if (token in tokens) return tokens[token as TokenName];
  return NEUTRAL_BLOCK;
}
