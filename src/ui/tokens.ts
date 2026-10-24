/**
 * Design tokens — a dark lab-instrument palette with cyan electrical accents.
 * Shared by DOM styles and three.js materials.
 */

export const tokens = {
  // Surfaces — neutral blue-black, never purple.
  bg: "#050a10",
  viewportCenter: "#0e1824",
  viewportEdge: "#050a10",
  panel: "#0a1420",
  panelBorder: "#1c3350",
  hairline: "#142640",

  // Text
  text: "#cfe3f2",
  textDim: "#7a8ea4",
  textFaint: "#5a7a96",
  fontMono: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',

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
  "accent-sensor": "#56c7a4",
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
