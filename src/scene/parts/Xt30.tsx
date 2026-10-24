/**
 * Xt30 — AMASS XT30 board-mount connector: yellow PA housing whose bevelled
 * end keys the negative contact, two gold-plated contacts sunk into their
 * sockets, and heavy solder joints underneath.
 */
import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { merge } from "./geometry";
import { bottomJoints } from "./throughHole";
import type { FamilyProps } from "./types";

const BEVEL = 1.2;
const SOCKET_R = 1.25;
const CONTACT_R = 0.5;

export default function Xt30({ part, pads, kit, thicknessMm }: FamilyProps): React.ReactElement {
  const w = part.body.w, d = part.body.h, h = part.body.height;
  const negative = pads.find((p) => p.pad.number === "-") ?? pads[1];
  // +1 when the negative contact is toward local +y.
  const keySide = negative && negative.at.y < 0 ? -1 : 1;

  const geometry = useMemo(() => {
    const outline = new THREE.Shape();
    const k = keySide;
    outline.moveTo(-w / 2, -k * d / 2);
    outline.lineTo(w / 2, -k * d / 2);
    outline.lineTo(w / 2, k * (d / 2 - BEVEL));
    outline.lineTo(w / 2 - BEVEL, k * d / 2);
    outline.lineTo(-w / 2 + BEVEL, k * d / 2);
    outline.lineTo(-w / 2, k * (d / 2 - BEVEL));
    outline.closePath();
    for (const { at } of pads) {
      const socket = new THREE.Path();
      socket.absarc(at.x, at.y, SOCKET_R, 0, Math.PI * 2, true);
      outline.holes.push(socket);
    }
    const housing = new THREE.ExtrudeGeometry(outline, { depth: h, bevelEnabled: false, curveSegments: 24 });
    const floors = merge(pads.map(({ at }) => new THREE.CylinderGeometry(SOCKET_R, SOCKET_R, 0.2, 24).rotateX(Math.PI / 2).translate(at.x, at.y, h * 0.35)));
    const contacts = merge(pads.map(({ at }) => new THREE.CylinderGeometry(CONTACT_R, CONTACT_R, h * 0.55, 20).rotateX(Math.PI / 2).translate(at.x, at.y, h * 0.35 + (h * 0.55) / 2)));
    const joints = bottomJoints(pads, thicknessMm, "round", 1.0);
    return { housing, floors, contacts, joints };
  }, [w, d, h, keySide, pads, thicknessMm]);
  useEffect(() => () => { for (const g of Object.values(geometry)) g.dispose(); }, [geometry]);

  return (
    <group>
      <mesh geometry={geometry.housing} material={kit.get("nylonYellow")} castShadow receiveShadow />
      <mesh geometry={geometry.floors} material={kit.get("cavity")} />
      <mesh geometry={geometry.contacts} material={kit.get("gold")} />
      <mesh geometry={geometry.joints} material={kit.get("solder")} />
    </group>
  );
}
