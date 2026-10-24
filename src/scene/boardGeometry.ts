/**
 * boardGeometry.ts — three.js geometry for the board outline. Board space is
 * +y down; three space is +y up, so y is negated here and nowhere else in the
 * board stack.
 */
import * as THREE from "three";
import type { Vec2 } from "../model/board-model";
import type { MountingHole } from "./boardFeatures";
import type { BoardFrame } from "./bake/bakeBoard";

export function toThree(p: Vec2, z = 0): THREE.Vector3 {
  return new THREE.Vector3(p.x, -p.y, z);
}

function outlineShape(outline: Vec2[], holes: MountingHole[]): THREE.Shape {
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.y)));
  for (const h of holes) {
    const path = new THREE.Path();
    path.absarc(h.position.x, -h.position.y, h.drillMm / 2, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }
  return shape;
}

/** A flat face in the shape of the board, UV-mapped onto the baked canvases. */
export function boardFace(outline: Vec2[], holes: MountingHole[], frame: BoardFrame): THREE.ShapeGeometry {
  const geom = new THREE.ShapeGeometry(outlineShape(outline, holes), 48);
  const pos = geom.attributes["position"] as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - frame.minX) / frame.widthMm;
    // Canvas row 0 is the board's top edge (board y = minY, three y = -minY).
    uv[i * 2 + 1] = (pos.getY(i) + frame.minY + frame.heightMm) / frame.heightMm;
  }
  geom.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geom;
}

/** The milled board edge (and hole walls) as an extrusion from -thickness to 0. */
export function boardEdge(outline: Vec2[], holes: MountingHole[], thicknessMm: number): THREE.ExtrudeGeometry {
  const geom = new THREE.ExtrudeGeometry(outlineShape(outline, holes), {
    depth: thicknessMm,
    bevelEnabled: false,
    curveSegments: 48,
  });
  geom.translate(0, 0, -thicknessMm);
  return geom;
}
