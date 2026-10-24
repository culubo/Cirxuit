/**
 * Sot23 — 2.9 x 1.3 mm SOT-23 moulding with three formed gull-wing leads
 * landing on the board's pads (base and emitter on one side, collector on the
 * other) and the manufacturer's laser marking on top.
 */
import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { part as finish } from "../palette";
import { draftedBlock, gullWings } from "./geometry";
import type { FamilyProps } from "./types";

const BODY_LONG = 2.9;
const BODY_SHORT = 1.3;
const BODY_H = 0.95;
const STANDOFF = 0.06;

/** Top-side marking codes for common SOT-23 parts (JEDEC / vendor codes). */
const MARKING: Record<string, string> = {
  "2N3904": "1AM", // MMBT3904
  "2N3906": "2A",  // MMBT3906
  "2N2222": "1P",  // MMBT2222A
  "BC847": "1F",
};

export default function Sot23({ part, pads, kit }: FamilyProps): React.ReactElement {
  // Leads leave the long sides; find which local axis the pads spread along.
  const leadsOnX = Math.max(...pads.map((p) => Math.abs(p.at.x))) >= Math.max(...pads.map((p) => Math.abs(p.at.y)));
  const w = leadsOnX ? BODY_SHORT : BODY_LONG;
  const d = leadsOnX ? BODY_LONG : BODY_SHORT;

  const geometry = useMemo(() => {
    const body = draftedBlock(w, d, BODY_H - STANDOFF, 0.07, STANDOFF);
    const leads = gullWings(pads.map(({ at }) => {
      const dir = leadsOnX ? new THREE.Vector2(Math.sign(at.x) || 1, 0) : new THREE.Vector2(0, Math.sign(at.y) || 1);
      const edge = leadsOnX ? w / 2 : d / 2;
      const along = leadsOnX ? Math.abs(at.x) : Math.abs(at.y);
      const from = leadsOnX ? new THREE.Vector2(dir.x * edge, at.y) : new THREE.Vector2(at.x, dir.y * edge);
      return { from, dir, reach: along + 0.12 - edge, foot: 0.4, exitZ: 0.42, width: 0.4, thickness: 0.12 };
    }));
    return { body, leads };
  }, [pads, leadsOnX, w, d]);
  useEffect(() => () => { geometry.body.dispose(); geometry.leads.dispose(); }, [geometry]);

  const code = MARKING[part.value.toUpperCase()] ?? "";
  const top = useMemo(() => kit.decal((ctx, cw, ch) => {
    ctx.fillStyle = finish.epoxy;
    ctx.fillRect(0, 0, cw, ch);
    if (!code) return;
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    // Text runs along the long axis of the package.
    if (leadsOnX) ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = finish.epoxyMarking;
    ctx.font = `600 ${Math.round(Math.min(cw, ch) * 0.42)}px "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(code, 0, 0);
    ctx.restore();
  }, Math.round(64 * w), Math.round(64 * d), { roughness: 0.55 }), [kit, code, leadsOnX, w, d]);

  const epoxy = kit.get("epoxy");
  // BoxGeometry face order: +x, -x, +y, -y, +z (top), -z.
  const bodyMaterials = useMemo(() => [epoxy, epoxy, epoxy, epoxy, top, epoxy], [epoxy, top]);

  return (
    <group>
      <mesh geometry={geometry.body} material={bodyMaterials} castShadow receiveShadow />
      <mesh geometry={geometry.leads} material={kit.get("tin")} castShadow />
    </group>
  );
}
