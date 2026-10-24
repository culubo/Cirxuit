import type * as THREE from "three";
import type { Pad, Part } from "../../model/board-model";
import type { MaterialKit } from "./kit";

/** A pad expressed in the part's local frame (mm, +y toward the board top). */
export interface LocalPad {
  pad: Pad;
  at: THREE.Vector2;
  /** Pad extent along the local x and y axes. */
  size: THREE.Vector2;
}

export interface FamilyProps {
  part: Part;
  pads: LocalPad[];
  kit: MaterialKit;
  thicknessMm: number;
  /** LED forward current as a fraction of its rating (0 when off). */
  glow: number;
}
