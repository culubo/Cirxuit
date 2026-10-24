/**
 * PinHeader — 2.54 mm single-row header: black PA66 strip 2.5 mm tall with a
 * gold-flash 0.64 mm square pin through each pad, pointed tips, and solder
 * joints with clipped tails on the underside.
 */
import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { box, merge } from "./geometry";
import { bottomJoints } from "./throughHole";
import type { FamilyProps } from "./types";

const PITCH = 2.54;
const HOUSING_H = 2.5;
const PIN = 0.64;

export default function PinHeader({ part, pads, kit, thicknessMm }: FamilyProps): React.ReactElement {
  const top = Math.max(part.body.height, HOUSING_H + 3);

  const geometry = useMemo(() => {
    const xs = pads.map((p) => p.at.x), ys = pads.map((p) => p.at.y);
    const spanX = Math.max(...xs) - Math.min(...xs), spanY = Math.max(...ys) - Math.min(...ys);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const housing = merge([
      // One moulded cell per pin, slightly waisted so the cells read individually.
      ...pads.map(({ at }): THREE.BufferGeometry => box(PITCH - 0.06, PITCH - 0.06, HOUSING_H, at.x, at.y, 0)),
      box(spanX + PITCH - 0.3, spanY + PITCH - 0.3, HOUSING_H - 0.1, cx, cy, 0.05),
    ]);
    const pins = merge(pads.flatMap(({ at }) => {
      const shaft = box(PIN, PIN, top - 0.35, at.x, at.y, -0.02);
      const tip = new THREE.CylinderGeometry(0.16, PIN * 0.71, 0.35, 4, 1);
      tip.rotateY(Math.PI / 4);
      tip.rotateX(Math.PI / 2);
      tip.translate(at.x, at.y, top - 0.175);
      return [shaft, tip];
    }));
    const joints = bottomJoints(pads, thicknessMm, "square", PIN);
    return { housing, pins, joints };
  }, [pads, top, thicknessMm]);
  useEffect(() => () => { for (const g of Object.values(geometry)) g.dispose(); }, [geometry]);

  return (
    <group>
      <mesh geometry={geometry.housing} material={kit.get("nylonBlack")} castShadow receiveShadow />
      <mesh geometry={geometry.pins} material={kit.get("gold")} castShadow />
      <mesh geometry={geometry.joints} material={kit.get("solder")} />
    </group>
  );
}
