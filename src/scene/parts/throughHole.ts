/**
 * throughHole.ts — the parts of a through-hole joint that every THT family
 * shares: the lead tail under the board and the wave-solder fillet around it.
 */
import * as THREE from "three";
import { drillFor } from "../footprint";
import { merge } from "./geometry";
import type { LocalPad } from "./types";

/** Solder cones on the bottom side plus the clipped lead tails below them. */
export function bottomJoints(pads: LocalPad[], thicknessMm: number, lead: "square" | "round", leadSize: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const { pad, at } of pads) {
    const ring = Math.min(pad.sizeMm.w, pad.sizeMm.h) / 2;
    const cone = new THREE.CylinderGeometry(ring * 0.95, Math.max(leadSize * 0.7, drillFor(pad) * 0.45), 0.55, 20, 1, false);
    cone.rotateX(Math.PI / 2);
    cone.translate(at.x, at.y, -thicknessMm - 0.275);
    parts.push(cone);
    const tail = lead === "square"
      ? new THREE.BoxGeometry(leadSize, leadSize, 1.2)
      : new THREE.CylinderGeometry(leadSize / 2, leadSize / 2, 1.2, 10).rotateX(Math.PI / 2);
    tail.translate(at.x, at.y, -thicknessMm - 0.6);
    parts.push(tail);
  }
  return merge(parts);
}
