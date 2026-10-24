/**
 * Design tokens — the "glowing circuit blueprint" palette: deep navy ground,
 * electric-cyan traces and accents, light bloom.
 *
 * Single source of truth for colour, used by both DOM styles and three.js
 * materials. Prefer referencing a token over a raw hex wherever one exists.
 */

export const tokens = {
  // Surfaces — deep navy, like a backlit circuit blueprint
  bg: "#050b18",
  panel: "#0a1424",
  panelBorder: "#1c3350",
  hairline: "#142640",

  // Text
  text: "#cfe3f2",
  textDim: "#7a8ea4",
  textFaint: "#5a7a96",

  // Accents (meaning-carrying)
  phosphor: "#4fd8ff",    // current / selection — electric cyan (name kept for callers)
  amber: "#e0a84a",       // warnings
  danger: "#d9463b",      // danger

  // Board artwork
  silk: "#d8f2ff",        // pale cyan silkscreen
  solderMask: "#0a1f3d",  // deep navy solder mask
  copper: "#3fb6f0",      // glowing cyan traces
  copperBack: "#2a7fc0",  // back copper, dimmer blue
  fr4: "#0c1a30",         // substrate edge

  // Function-block accent tokens (match board JSON `color` fields)
  "accent-power": "#ffc857",
  "accent-mcu": "#4fd8ff",
  "accent-driver": "#7ab8ff",
  "accent-sensor": "#b98cff",
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
