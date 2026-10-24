/**
 * Trimpot — single-turn cermet trimmer: blue moulded body, a cream rotor with
 * a cross-slot on top whose angle follows the wiper setting, the EIA value
 * code moulded beside it, and three soldered legs underneath.
 */
import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { resistorCode } from "../footprint";
import { part as finish } from "../palette";
import { box, draftedBlock, merge } from "./geometry";
import { bottomJoints } from "./throughHole";
import type { FamilyProps } from "./types";

/** A single-turn trimmer sweeps about 260 degrees of rotation. */
const SWEEP = (260 * Math.PI) / 180;

export default function Trimpot({ part, pads, kit, thicknessMm }: FamilyProps): React.ReactElement {
  const w = part.body.w, d = part.body.h, h = part.body.height;
  const rotorR = Math.min(w, d) * 0.36;
  const wiper = part.model?.type === "potentiometer" ? part.model.wiper : 0.5;
  const ohms = part.model?.type === "potentiometer" ? part.model.ohms : null;

  const geometry = useMemo(() => {
    const body = draftedBlock(w, d, h - 0.6, 0.08, 0.6);
    const standoffs = merge([box(w - 0.4, 0.5, 0.6, 0, d / 2 - 0.45, 0), box(w - 0.4, 0.5, 0.6, 0, -d / 2 + 0.45, 0)]);
    const rotor = new THREE.CylinderGeometry(rotorR, rotorR, 0.5, 40).rotateX(Math.PI / 2).translate(w * 0.08, 0, h + 0.25);
    const slot = merge([box(rotorR * 1.6, 0.28, 0.12, 0, 0, 0), box(0.28, rotorR * 1.6, 0.12, 0, 0, 0)]);
    const joints = bottomJoints(pads, thicknessMm, "round", 0.5);
    return { body, standoffs, rotor, slot, joints };
  }, [w, d, h, rotorR, pads, thicknessMm]);
  useEffect(() => () => { for (const g of Object.values(geometry)) g.dispose(); }, [geometry]);

  const code = ohms !== null ? resistorCode(ohms) : "";
  const top = useMemo(() => kit.decal((ctx, cw, ch) => {
    ctx.fillStyle = finish.trimmerBlue;
    ctx.fillRect(0, 0, cw, ch);
    if (!code) return;
    ctx.fillStyle = finish.trimmerRotor;
    ctx.font = `700 ${Math.round(ch * 0.16)}px "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(code, cw * 0.14, ch * 0.5);
  }, Math.round(64 * w), Math.round(64 * d), { roughness: 0.38 }), [kit, code, w, d]);

  const blue = kit.get("trimmerBlue");
  const bodyMaterials = useMemo(() => [blue, blue, blue, blue, top, blue], [blue, top]);

  return (
    <group>
      <mesh geometry={geometry.body} material={bodyMaterials} castShadow receiveShadow />
      <mesh geometry={geometry.standoffs} material={blue} />
      <mesh geometry={geometry.rotor} material={kit.get("trimmerRotor")} castShadow />
      <mesh geometry={geometry.slot} material={kit.get("cavity")} position={[w * 0.08, 0, h + 0.39]} rotation={[0, 0, (wiper - 0.5) * SWEEP]} />
      <mesh geometry={geometry.joints} material={kit.get("solder")} />
    </group>
  );
}
