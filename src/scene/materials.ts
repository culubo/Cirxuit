/**
 * PBR material factories for the board. Each returns a fresh material instance;
 * callers memoise per component so materials are not recreated every frame.
 */
import * as THREE from "three";
import { tokens } from "../ui/tokens";

/** Green solder mask with a slight clearcoat, as per design.md. */
export function solderMaskMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(tokens.solderMask),
    roughness: 0.5,
    metalness: 0.0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.35,
  });
}

/** Metallic copper for front/back traces. */
export function copperMaterial(back = false): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(back ? tokens.copperBack : tokens.copper),
    roughness: 0.35,
    metalness: 1.0,
  });
}

/** White silkscreen. */
export function silkMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(tokens.silk),
    roughness: 0.9,
    metalness: 0.0,
  });
}
