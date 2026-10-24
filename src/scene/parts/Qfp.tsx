/**
 * Qfp — a TQFP at true size: drafted moulding at a 0.1 mm standoff, every lead
 * formed as a gull-wing onto its land, a moulded pin-1 dimple, and the
 * laser-etched part number.
 */
import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { isPartNumber, qfpGeometry, qfpPins } from "../footprint";
import { part as finish } from "../palette";
import { draftedBlock, gullWings } from "./geometry";
import type { FamilyProps } from "./types";

const STANDOFF = 0.1;
const BODY_H = 1.0;
/** TQFP lead span is the body plus 1.0 mm per side. */
const LEAD_REACH = 1.0;

export default function Qfp({ part, kit }: FamilyProps): React.ReactElement {
  const geom = useMemo(() => qfpGeometry(part), [part]);
  const B = geom.body;

  const geometry = useMemo(() => {
    const body = draftedBlock(B, B, BODY_H, 0.1, STANDOFF);
    const leads = gullWings(qfpPins(geom).map((pin) => {
      // Package-local pins are in board orientation (+y down); flip to the scene's +y up.
      const dir = new THREE.Vector2(pin.outward.x, -pin.outward.y);
      const tangent = new THREE.Vector2(pin.local.x, -pin.local.y).sub(dir.clone().multiplyScalar(geom.landCenter));
      const from = tangent.add(dir.clone().multiplyScalar(B / 2));
      return { from, dir, reach: LEAD_REACH, foot: 0.6, exitZ: STANDOFF + BODY_H * 0.42, width: 0.37, thickness: 0.127 };
    }));
    return { body, leads };
  }, [B, geom]);
  useEffect(() => () => { geometry.body.dispose(); geometry.leads.dispose(); }, [geometry]);

  const value = part.value;
  const top = useMemo(() => kit.decal((ctx, w, h) => {
    const lines = isPartNumber(value) ? [value.toUpperCase(), "AU"] : [];
    ctx.fillStyle = finish.epoxy;
    ctx.fillRect(0, 0, w, h);
    // Pin-1 dimple: a polished moulded recess near the first lead.
    const r = w * 0.055;
    const cx = w * 0.14, cy = h * 0.14;
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    g.addColorStop(0, finish.epoxyDimpleLight);
    g.addColorStop(1, finish.epoxyDimpleDark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = finish.epoxyMarking;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    lines.forEach((line, i) => {
      ctx.font = `600 ${Math.round(h * (i === 0 ? 0.105 : 0.08))}px "Helvetica Neue", Arial, sans-serif`;
      ctx.fillText(line, w / 2, h * (0.47 + i * 0.15));
    });
  }, 512, 512, { roughness: 0.6 }), [kit, value]);

  const epoxy = kit.get("epoxy");
  const bodyMaterials = useMemo(() => [epoxy, epoxy, epoxy, epoxy, top, epoxy], [epoxy, top]);

  return (
    <group>
      <mesh geometry={geometry.body} material={bodyMaterials} castShadow receiveShadow />
      <mesh geometry={geometry.leads} material={kit.get("tin")} castShadow />
    </group>
  );
}
