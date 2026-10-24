import React, { useMemo } from "react";
import * as THREE from "three";
import type { Vec2 } from "../model/board-model";
import { solderMaskMaterial } from "./materials";

interface BoardSlabProps {
  outline: Vec2[];
  thicknessMm: number;
}

/**
 * Renders the FR4 substrate as a flat extruded slab.
 * The outline polygon is extruded along Z by thicknessMm.
 * Board space: origin top-left, +x right, +y down (KiCad convention).
 * Three.js space: same X, Y flipped to +y up, Z for depth.
 */
export default function BoardSlab({ outline, thicknessMm }: BoardSlabProps): React.ReactElement {
  const geometry = useMemo(() => {
    if (outline.length < 3) return new THREE.BoxGeometry(0, 0, 0);

    const shape = new THREE.Shape();
    const first = outline[0];
    if (!first) return new THREE.BoxGeometry(0, 0, 0);
    shape.moveTo(first.x, -first.y);
    for (let i = 1; i < outline.length; i++) {
      const pt = outline[i];
      if (pt) shape.lineTo(pt.x, -pt.y);
    }
    shape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: thicknessMm,
      bevelEnabled: false,
    };
    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
  }, [outline, thicknessMm]);

  const material = useMemo(() => solderMaskMaterial(), []);

  return (
    <mesh geometry={geometry} position={[0, 0, -thicknessMm]} material={material} castShadow receiveShadow />
  );
}
