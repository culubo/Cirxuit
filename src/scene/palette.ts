/**
 * palette.ts — physical material colours for the board and its parts.
 *
 * These are not UI tokens: they describe real finishes (LPI solder mask, ENIG
 * gold, FR-4 laminate, tin terminations, moulding compounds) and are tuned for
 * the ACES filmic tone mapping the scene uses. UI colour lives in ui/tokens.ts.
 */
export const pcb = {
  // Board finish: green LPI mask over 1 oz copper, ENIG pads, white epoxy silk.
  mask: "#0f4d2a",
  maskOverCopper: "#2c7a3a",
  maskGloss: 0.28,
  enig: "#d8b25c",
  enigShadow: "#a8873e",
  bareCopper: "#c8743a",
  silk: "#efefe6",
  drill: "#0a0907",
  laminate: "#c9b47a",      // bare FR-4 where mask is pulled back
  laminateEdge: "#b9a467",  // milled board edge
  core: "#d6c38a",          // FR-4 core seen in the exploded view
  coreWeave: "#7a6a3a",
} as const;

export const part = {
  epoxy: "#161616",          // IC / transistor moulding compound
  epoxyMarking: "#8d8d88",   // laser-etched marking
  epoxyDimpleLight: "#2a2a2a", // polished pin-1 recess
  epoxyDimpleDark: "#0b0b0b",
  resistorTop: "#121212",    // thick-film overglaze
  resistorMarking: "#e8e8e0",
  alumina: "#e9e5d8",        // chip resistor substrate
  mlcc: "#b28d63",           // C0G/X7R ceramic body
  tin: "#c6c8ca",            // matte tin terminations and leads
  gold: "#e2bb57",           // gold-flash header pins
  solder: "#d4d6d8",
  nylonBlack: "#1c1c1c",     // PA66 connector housings
  nylonYellow: "#e4b51e",    // XT30 housing
  trimmerBlue: "#2353b5",    // cermet trimmer body
  trimmerRotor: "#e9dfc6",
  canAluminium: "#cfd3d6",
  canSleeve: "#16233f",      // PET sleeve
  canSleeveStripe: "#9fb0c8",
  rubber: "#202020",
  ledBase: "#f3f2ee",
  ledLens: "#f6f4ea",
  ledCathodeMark: "#1f8a3c",
  fuseBody: "#d7c27e",
} as const;

/** Emission colours by LED colour name (board JSON `color`). */
export const ledEmission = {
  red: "#ff2a12",
  green: "#28ff5a",
  blue: "#2f6bff",
  yellow: "#ffd21a",
  amber: "#ff9a1a",
  white: "#f4f6ff",
} as const;

/** Pick-and-place head used by the assembly demo. */
export const machine = {
  headBody: "#3a3f46",
  nozzle: "#c9ccd0",
  tip: "#1b1b1b",
} as const;
