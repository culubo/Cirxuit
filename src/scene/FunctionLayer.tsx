/**
 * FunctionLayer — the board's function blocks floating above the exploded
 * stack: a translucent outline around each block's parts, tinted with the
 * block's accent colour and labelled. Fades in as the board comes apart.
 */
import React, { useMemo, useRef } from "react";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import type { Board, FunctionBlock } from "../model/board-model";
import { blockColor } from "../ui/tokens";
import { landPattern } from "./footprint";
import LabelSprite from "./LabelSprite";
import { EXPLODE_MM, labelMix } from "./layers";
import { useExplodeSpring } from "./useExplodeSpring";

const MARGIN = 1.4;

interface BlockShape {
  block: FunctionBlock;
  color: string;
  outline: THREE.Vector3[];
  center: THREE.Vector3;
  size: [number, number];
  labelAt: THREE.Vector3;
}

function blockShape(board: Board, block: FunctionBlock): BlockShape | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ref of block.partRefs) {
    const part = board.parts.find((p) => p.ref === ref);
    if (!part) continue;
    const r = Math.max(part.body.w, part.body.h) / 2;
    minX = Math.min(minX, part.position.x - r); maxX = Math.max(maxX, part.position.x + r);
    minY = Math.min(minY, part.position.y - r); maxY = Math.max(maxY, part.position.y + r);
    for (const pad of landPattern(part)) {
      minX = Math.min(minX, pad.position.x - pad.sizeMm.w / 2); maxX = Math.max(maxX, pad.position.x + pad.sizeMm.w / 2);
      minY = Math.min(minY, pad.position.y - pad.sizeMm.h / 2); maxY = Math.max(maxY, pad.position.y + pad.sizeMm.h / 2);
    }
  }
  if (!Number.isFinite(minX)) return null;
  minX -= MARGIN; minY -= MARGIN; maxX += MARGIN; maxY += MARGIN;
  const r = 1.2;
  const outline: THREE.Vector3[] = [];
  const corner = (cx: number, cy: number, start: number) => {
    for (let i = 0; i <= 8; i++) {
      const t = start + (i / 8) * (Math.PI / 2);
      outline.push(new THREE.Vector3(cx + r * Math.cos(t), cy + r * Math.sin(t), 0));
    }
  };
  // Three space: +y up, so the board's top edge is -minY.
  corner(maxX - r, -minY - r, 0);
  corner(minX + r, -minY - r, Math.PI / 2);
  corner(minX + r, -maxY + r, Math.PI);
  corner(maxX - r, -maxY + r, (3 * Math.PI) / 2);
  outline.push(outline[0]!.clone());
  return {
    block,
    color: blockColor(block.color),
    outline,
    center: new THREE.Vector3((minX + maxX) / 2, -(minY + maxY) / 2, 0),
    size: [maxX - minX, maxY - minY],
    labelAt: new THREE.Vector3(minX, -minY, 0),
  };
}

export default function FunctionLayer({ board }: { board: Board }): React.ReactElement {
  const shapes = useMemo(
    () => board.blocks.map((b) => blockShape(board, b)).filter((s): s is BlockShape => s !== null),
    [board],
  );
  const group = useRef<THREE.Group>(null);
  const fills = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const lines = useRef<({ material: THREE.Material & { opacity: number } } | null)[]>([]);
  const labels = useRef<(THREE.Sprite | null)[]>([]);

  useExplodeSpring((f) => {
    const fade = labelMix(f);
    if (group.current) {
      group.current.position.z = EXPLODE_MM.blocks * f;
      group.current.visible = fade > 0.001;
    }
    for (const m of fills.current) if (m) m.opacity = 0.07 * fade;
    for (const l of lines.current) if (l) l.material.opacity = 0.85 * fade;
    for (const sprite of labels.current) if (sprite) (sprite.material as THREE.SpriteMaterial).opacity = fade;
  });

  return (
    <group ref={group} visible={false}>
      {shapes.map((s, i) => (
        <group key={s.block.id}>
          <mesh position={s.center} raycast={() => null}>
            <planeGeometry args={s.size} />
            <meshBasicMaterial
              ref={(m) => { fills.current[i] = m; }}
              color={s.color}
              transparent
              opacity={0}
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
          <Line
            ref={(l) => { lines.current[i] = l as unknown as { material: THREE.Material & { opacity: number } } | null; }}
            points={s.outline}
            color={s.color}
            lineWidth={1.5}
            transparent
            opacity={0}
            toneMapped={false}
            raycast={() => null}
          />
          <LabelSprite
            ref={(sprite) => { labels.current[i] = sprite; }}
            text={s.block.label}
            color={s.color}
            position={[s.labelAt.x, s.labelAt.y + 0.9, 0]}
          />
        </group>
      ))}
    </group>
  );
}
