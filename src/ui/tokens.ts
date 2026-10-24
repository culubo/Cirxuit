/**
 * Design tokens — a mint field-instrument palette: forest-black housings,
 * phosphor-mint interaction, and warm electrical warning colors.
 */

export const tokens = {
  // Matte housings and the softly illuminated center stage.
  bg: "#050a07",
  viewportCenter: "#183126",
  viewportEdge: "#050a07",
  panel: "#0c1712",
  panelRaised: "#13221a",
  panelBorder: "#294437",
  hairline: "#1b3025",
  controlActive: "#b6f5d7",
  controlActiveSoft: "#123025",
  controlBorder: "#3f9f7d",
  selectionInk: "#06120c",

  // Cool paper-like lettering.
  text: "#e5ece7",
  textDim: "#899b90",
  textFaint: "#5f7568",
  // ISO 3098 technical lettering is the product face. The legacy property name
  // remains so existing canvas and editor consumers inherit it automatically.
  fontMono: '"osifont", "Helvetica Neue", Arial, system-ui, sans-serif',

  // Semantic accents. Cyan is reserved for current, hover, and selection.
  phosphor: "#75f0c1",
  power: "#c8e86b",
  sensor: "#6ed6b0",
  signal: "#72cad1",
  driver: "#ee9a61",
  healthy: "#7be495",
  thermal: "#e8b656",
  amber: "#e8b656",
  danger: "#e7655d",

  // Board artwork used by diagrams; physical materials live in scene/palette.
  silk: "#e8f3eb",
  solderMask: "#123323",
  copper: "#66d9b0",
  copperBack: "#4a9e88",
  fr4: "#273c2f",

  // Function-block accent tokens (match board JSON `color` fields)
  "accent-power": "#c8e86b",
  "accent-mcu": "#72cad1",
  "accent-driver": "#ee9a61",
  "accent-sensor": "#6ed6b0",
  "accent-warn": "#e8b656",
} as const;

export type TokenName = keyof typeof tokens;

const NEUTRAL_BLOCK = "#819287";

/**
 * Resolve a FunctionBlock.color token (e.g. "accent-power") to a hex string.
 * Unknown tokens fall back to a quiet neutral so the UI never shows a raw token.
 */
export function blockColor(token: string): string {
  if (token in tokens) return tokens[token as TokenName];
  return NEUTRAL_BLOCK;
}
