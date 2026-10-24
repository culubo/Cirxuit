/**
 * layers.ts — where each physical layer sits at full explode (mm along +z,
 * relative to the board's top face), shared by every scene object that has to
 * stay registered with a layer: the board stack, parts, current particles, net
 * highlights, and the function layer.
 */
export const EXPLODE_MM = {
  blocks: 22,
  parts: 14,
  silk: 8.5,
  mask: 5.75,
  copperTop: 3,
  copperIn1: 1.5,
  core: 0,
  copperIn2: -1.5,
  copperBottom: -3,
  bottomSurface: -5.75,
} as const;

/** Explode value at which the layers have fully separated into films. */
const SEPARATE_FROM = 0.02;
const SEPARATE_TO = 0.18;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** 0 when collapsed (finished board), 1 once the layers read as separate films. */
export function layerMix(explode: number): number {
  return smoothstep(SEPARATE_FROM, SEPARATE_TO, explode);
}

/** Fade-in for labels and the function layer, which only make sense apart. */
export function labelMix(explode: number): number {
  return smoothstep(0.3, 0.55, explode);
}

/** z of a copper layer's top face at a given explode value. */
export function copperZ(layer: string, explode: number, thicknessMm: number): number {
  if (layer === "B.Cu") return -thicknessMm + EXPLODE_MM.copperBottom * explode;
  if (layer === "In1.Cu") return -thicknessMm / 3 + EXPLODE_MM.copperIn1 * explode;
  if (layer === "In2.Cu") return -thicknessMm * 2 / 3 + EXPLODE_MM.copperIn2 * explode;
  return EXPLODE_MM.copperTop * explode;
}
