/**
 * ChipPassive — EIA chip resistor, MLCC, or chip fuse at true size.
 *
 * Local frame: terminals on ±x. A thick-film resistor is a white alumina
 * substrate with a black overglaze carrying its EIA value code and wrap-around
 * tin terminations; an MLCC is a solid tan ceramic block; a chip fuse is a
 * pale moulded body. Each termination sits in a solder fillet on its land.
 */
import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { chipSize, packageFamily, resistorCode } from "../footprint";
import { part as finish } from "../palette";
import { box, merge, solderFillet } from "./geometry";
import type { FamilyProps } from "./types";

const STANDOFF = 0.03;

export default function ChipPassive({ part, pads, kit }: FamilyProps): React.ReactElement {
  const family = packageFamily(part);
  const size = chipSize(part);
  const { length: L, width: W, height: H, terminal: T } = size;
  const ohms = part.model?.type === "resistor" ? part.model.ohms : null;
  const code = family === "chip-resistor" && ohms !== null ? resistorCode(ohms) : "";

  const geometry = useMemo(() => {
    const body = box(L - 0.02, W - 0.02, H - 0.02, 0, 0, STANDOFF);
    const terminations = merge([
      box(T, W + 0.02, H + 0.01, -(L - T) / 2, 0, STANDOFF - 0.005),
      box(T, W + 0.02, H + 0.01, (L - T) / 2, 0, STANDOFF - 0.005),
    ]);
    const fillets = merge(pads.slice(0, 2).map(({ at, size: land }) => {
      const s = Math.sign(at.x) || 1;
      const outerEdge = Math.abs(at.x) + land.x / 2;
      const run = Math.max(0.08, Math.min(0.45, outerEdge - L / 2));
      return solderFillet(new THREE.Vector2((s * L) / 2, 0), new THREE.Vector2(s, 0), W * 0.92, run, H * 0.5);
    }));
    const overglaze = box(L - 2 * T, W - 0.02, 0.02, 0, 0, STANDOFF + H - 0.02);
    return { body, terminations, fillets, overglaze };
  }, [L, W, H, T, pads]);
  useEffect(() => () => { for (const g of Object.values(geometry)) g.dispose(); }, [geometry]);

  const marking = useMemo(() => {
    if (!code) return null;
    const aspect = (L - 2 * T) / W;
    return kit.decal((ctx, w, h) => {
      ctx.fillStyle = finish.resistorTop;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = finish.resistorMarking;
      ctx.font = `600 ${Math.round(h * 0.62)}px "Helvetica Neue", Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(code, w / 2, h / 2 + h * 0.03);
    }, Math.round(128 * aspect), 128, { roughness: 0.4 });
  }, [code, kit, L, T, W]);

  const bodyMaterial = family === "chip-resistor" ? kit.get("alumina") : family === "chip-fuse" ? kit.get("fuseBody") : kit.get("mlcc");

  return (
    <group>
      <mesh geometry={geometry.body} material={bodyMaterial} castShadow receiveShadow />
      <mesh geometry={geometry.terminations} material={kit.get("tin")} castShadow />
      <mesh geometry={geometry.fillets} material={kit.get("solder")} />
      {family === "chip-resistor" && (
        <mesh geometry={geometry.overglaze} material={kit.get("resistorTop")}>
          {marking && (
            <mesh position={[0, 0, STANDOFF + H + 0.001]} material={marking}>
              <planeGeometry args={[L - 2 * T - 0.04, W - 0.06]} />
            </mesh>
          )}
        </mesh>
      )}
    </group>
  );
}
