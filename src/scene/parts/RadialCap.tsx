/**
 * RadialCap — radial aluminium electrolytic: a printed PET sleeve over the can
 * with the negative stripe facing the "-" lead, a scored vent on the bare
 * aluminium top, the rubber bung at the base, and soldered leads underneath.
 */
import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { part as finish } from "../palette";
import { merge } from "./geometry";
import { bottomJoints } from "./throughHole";
import type { FamilyProps } from "./types";

const BUNG = 0.45;

/** "470uF" → "470µF". */
function capLabel(value: string): string {
  return value.replace(/u(?=F)/i, "µ");
}

export default function RadialCap({ part, pads, kit, thicknessMm }: FamilyProps): React.ReactElement {
  const diameter = Number(/_D(\d+(?:\.\d+)?)mm/.exec(part.footprint)?.[1] ?? part.body.w);
  const r = diameter / 2;
  const height = part.body.height - BUNG;

  // Sleeve UVs start at -y and run counter-clockwise; centre the stripe on the "-" lead.
  const negative = pads.find((p) => p.pad.number === "2") ?? pads[1];
  const stripeU = useMemo(() => {
    const phi = negative ? Math.atan2(negative.at.y, negative.at.x) : -Math.PI / 2;
    return (((phi + Math.PI / 2) / (2 * Math.PI)) % 1 + 1) % 1;
  }, [negative]);

  const geometry = useMemo(() => {
    const sleeve = new THREE.CylinderGeometry(r, r, height - 0.3, 64, 1, true).rotateX(Math.PI / 2).translate(0, 0, BUNG + (height - 0.3) / 2);
    const lip = new THREE.TorusGeometry(r - 0.18, 0.2, 10, 64).translate(0, 0, BUNG + height - 0.3);
    const top = new THREE.CylinderGeometry(r - 0.25, r - 0.25, 0.08, 64).rotateX(Math.PI / 2).translate(0, 0, BUNG + height - 0.25);
    const vent = merge([
      new THREE.BoxGeometry(r * 1.1, 0.12, 0.04),
      new THREE.BoxGeometry(0.12, r * 1.1, 0.04),
    ]).translate(0, 0, BUNG + height - 0.19);
    const bung = new THREE.CylinderGeometry(r - 0.35, r - 0.35, BUNG, 40).rotateX(Math.PI / 2).translate(0, 0, BUNG / 2);
    const joints = bottomJoints(pads, thicknessMm, "round", 0.6);
    return { sleeve, lip, top, vent, bung, joints };
  }, [r, height, pads, thicknessMm]);
  useEffect(() => () => { for (const g of Object.values(geometry)) g.dispose(); }, [geometry]);

  const label = capLabel(part.value);
  const sleeve = useMemo(() => kit.decal((ctx, w, h) => {
    ctx.fillStyle = finish.canSleeve;
    ctx.fillRect(0, 0, w, h);
    // Negative stripe with its column of minus signs, wrapping across the seam.
    const stripeW = w * 0.2;
    for (const offset of [-w, 0, w]) {
      const x = stripeU * w + offset - stripeW / 2;
      ctx.fillStyle = finish.canSleeveStripe;
      ctx.fillRect(x, 0, stripeW, h);
      ctx.fillStyle = finish.canSleeve;
      for (let y = h * 0.12; y < h * 0.95; y += h * 0.16) ctx.fillRect(x + stripeW * 0.3, y, stripeW * 0.4, h * 0.035);
    }
    ctx.fillStyle = finish.canSleeveStripe;
    ctx.font = `600 ${Math.round(h * 0.13)}px "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const textU = (stripeU + 0.5) % 1;
    for (const offset of [-w, 0, w]) ctx.fillText(label, textU * w + offset, h * 0.5);
  }, 1024, 512, { roughness: 0.3, side: THREE.DoubleSide }), [kit, label, stripeU]);

  return (
    <group>
      <mesh geometry={geometry.sleeve} material={sleeve} castShadow receiveShadow />
      <mesh geometry={geometry.lip} material={sleeve} />
      <mesh geometry={geometry.top} material={kit.get("aluminium")} castShadow />
      <mesh geometry={geometry.vent} material={kit.get("cavity")} />
      <mesh geometry={geometry.bung} material={kit.get("rubber")} />
      <mesh geometry={geometry.joints} material={kit.get("solder")} />
    </group>
  );
}
