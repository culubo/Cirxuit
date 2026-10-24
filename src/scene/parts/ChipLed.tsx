/**
 * ChipLed — 0805 SMD LED: white moulded base with tin terminations, a clear
 * epoxy dome over the die, and a green cathode mark. The die and lens light up
 * in proportion to the solved forward current, and a small coloured point
 * light spills onto the board around it.
 */
import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { chipSize } from "../footprint";
import { ledEmission, part as finish } from "../palette";
import { box, merge, solderFillet } from "./geometry";
import type { FamilyProps } from "./types";

const BASE_H = 0.3;

export default function ChipLed({ part, pads, kit, glow }: FamilyProps): React.ReactElement {
  const { length: L, width: W, height: H, terminal: T } = chipSize(part);
  const color = ledEmission[(part.model?.type === "led" ? part.model.color : "red") as keyof typeof ledEmission] ?? ledEmission.red;
  const cathodeX = useMemo(() => {
    const model = part.model;
    const k = model?.type === "led" ? pads.find((p) => p.pad.number === model.cathodePad) : undefined;
    return Math.sign(k?.at.x ?? -1) || -1;
  }, [part.model, pads]);

  const geometry = useMemo(() => ({
    base: box(L - 2 * T + 0.02, W, BASE_H, 0, 0, 0.03),
    terminations: merge([
      box(T, W + 0.02, BASE_H + 0.02, -(L - T) / 2, 0, 0.02),
      box(T, W + 0.02, BASE_H + 0.02, (L - T) / 2, 0, 0.02),
    ]),
    fillets: merge(pads.slice(0, 2).map(({ at, size }) => {
      const s = Math.sign(at.x) || 1;
      const run = Math.max(0.08, Math.min(0.4, Math.abs(at.x) + size.x / 2 - L / 2));
      return solderFillet(new THREE.Vector2((s * L) / 2, 0), new THREE.Vector2(s, 0), W * 0.9, run, BASE_H * 0.7);
    })),
    lens: box(L - 0.12, W - 0.08, H - BASE_H, 0, 0, 0.03 + BASE_H),
    die: box(0.28, 0.28, 0.1, 0, 0, 0.03 + BASE_H),
    mark: box(0.12, W * 0.7, 0.01, cathodeX * (L / 2 - T - 0.12), 0, 0.03 + BASE_H - 0.005),
  }), [L, W, H, T, pads, cathodeX]);
  useEffect(() => () => { for (const g of Object.values(geometry)) g.dispose(); }, [geometry]);

  const materials = useMemo(() => {
    const lens = kit.adopt(new THREE.MeshStandardMaterial({
      color: finish.ledLens,
      roughness: 0.08,
      metalness: 0,
      transparent: true,
      opacity: 0.45,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0,
    }));
    lens.userData["baseOpacity"] = 0.45;
    const die = kit.adopt(new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0, toneMapped: false }));
    const mark = kit.adopt(new THREE.MeshStandardMaterial({ color: finish.ledCathodeMark, roughness: 0.6 }));
    // Light spilling onto the board: a soft additive disc, far cheaper than a point light.
    const spill = kit.decal((ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, "rgba(255,255,255,0.9)");
      g.addColorStop(0.25, "rgba(255,255,255,0.35)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, 128, 128, { color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    spill.userData["baseOpacity"] = 0;
    return { lens, die, mark, spill };
  }, [kit, color]);

  // Brightness follows forward current; clamp so overdrive still reads as "very bright".
  const level = Math.min(1.6, glow);
  materials.die.emissiveIntensity = level > 0.01 ? 0.4 + level * 9 : 0;
  materials.die.color.set(color).multiplyScalar(level > 0.01 ? 1 : 0.35);
  materials.lens.emissiveIntensity = level * 3;
  materials.spill.userData["baseOpacity"] = Math.min(1, level * 0.9);
  materials.spill.opacity = (materials.spill.userData["baseOpacity"] as number) * kit.focus;

  return (
    <group>
      <mesh geometry={geometry.base} material={kit.get("ledBase")} castShadow receiveShadow />
      <mesh geometry={geometry.terminations} material={kit.get("tin")} castShadow />
      <mesh geometry={geometry.fillets} material={kit.get("solder")} />
      <mesh geometry={geometry.mark} material={materials.mark} />
      <mesh geometry={geometry.die} material={materials.die} />
      <mesh geometry={geometry.lens} material={materials.lens} />
      <mesh position={[0, 0, 0.02]} material={materials.spill} renderOrder={3} raycast={() => null}>
        <planeGeometry args={[9, 9]} />
      </mesh>
    </group>
  );
}
