/**
 * NetHighlight — x-ray trace of the selected part's nets.
 *
 * The finished board hides copper under the mask, so when a part is selected
 * its nets are traced in the selection colour just above their copper layer
 * (following the layer when the board is exploded), pads included.
 */
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Board } from "../model/board-model";
import { useStore } from "../store/useStore";
import { tokens } from "../ui/tokens";
import { isThroughHole, landPattern } from "./footprint";
import { copperZ } from "./layers";
import { merge } from "./parts/geometry";
import { useExplodeSpring } from "./useExplodeSpring";

interface NetHighlightProps {
  board: Board;
  nets: Set<string>;
}

/** Flat copper outline for one layer's tracks and pads on the given nets. */
function layerGeometry(board: Board, nets: Set<string>, layer: "F.Cu" | "B.Cu"): THREE.BufferGeometry | null {
  const shapes: THREE.BufferGeometry[] = [];
  for (const t of board.tracks) {
    if (t.layer !== layer || !nets.has(t.netId)) continue;
    const dx = t.end.x - t.start.x, dy = -(t.end.y - t.start.y);
    const len = Math.hypot(dx, dy);
    const strip = new THREE.PlaneGeometry(len, t.widthMm);
    strip.rotateZ(Math.atan2(dy, dx));
    strip.translate((t.start.x + t.end.x) / 2, -(t.start.y + t.end.y) / 2, 0);
    shapes.push(strip);
    for (const end of [t.start, t.end]) {
      shapes.push(new THREE.CircleGeometry(t.widthMm / 2, 16).translate(end.x, -end.y, 0));
    }
  }
  for (const part of board.parts) {
    for (const pad of landPattern(part)) {
      if (!pad.netId || !nets.has(pad.netId) || !pad.layers.includes(layer)) continue;
      const g = isThroughHole(pad) && pad.sizeMm.w === pad.sizeMm.h
        ? new THREE.CircleGeometry(pad.sizeMm.w / 2, 24)
        : new THREE.PlaneGeometry(pad.sizeMm.w, pad.sizeMm.h);
      shapes.push(g.translate(pad.position.x, -pad.position.y, 0));
    }
  }
  for (const via of board.vias) {
    if (nets.has(via.netId)) shapes.push(new THREE.CircleGeometry(via.diameterMm / 2, 20).translate(via.position.x, -via.position.y, 0));
  }
  return shapes.length ? merge(shapes) : null;
}

export default function NetHighlight({ board, nets }: NetHighlightProps): React.ReactElement | null {
  // Rebuild only when the copper or the set of nets changes, not on every new Set.
  const key = [...nets].sort().join("|");
  const geometry = useMemo(() => {
    const selected = new Set(key ? key.split("|") : []);
    return { top: layerGeometry(board, selected, "F.Cu"), bottom: layerGeometry(board, selected, "B.Cu") };
  }, [board, key]);
  useEffect(() => () => { geometry.top?.dispose(); geometry.bottom?.dispose(); }, [geometry]);

  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: tokens.phosphor,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  }), []);
  useEffect(() => () => material.dispose(), [material]);

  const top = useRef<THREE.Mesh>(null);
  const bottom = useRef<THREE.Mesh>(null);
  useExplodeSpring((f) => {
    if (top.current) top.current.position.z = copperZ("F.Cu", f, board.thicknessMm) + 0.03;
    if (bottom.current) bottom.current.position.z = copperZ("B.Cu", f, board.thicknessMm) - 0.03;
  });

  if (nets.size === 0) return null;
  return (
    <group raycast={() => null}>
      {geometry.top && <mesh ref={top} geometry={geometry.top} material={material} renderOrder={2} raycast={() => null} />}
      {geometry.bottom && <mesh ref={bottom} geometry={geometry.bottom} material={material} renderOrder={2} raycast={() => null} />}
    </group>
  );
}
