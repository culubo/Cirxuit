/**
 * BoardStack — the physical board rendered as a stack of textured planes baked
 * from the board artwork, replacing the old extruded slab + track strips.
 *
 * Collapsed, the planes sit nearly coincident so it reads as one solid board.
 * Exploded, each layer fans out along +z (substrate, B.Cu, F.Cu, mask, silk).
 */
import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Board } from "../model/board-model";
import { bakeBoard, type BakedLayers } from "./bake/bakeBoard";
import { useExplodeSpring } from "./useExplodeSpring";
import { tokens } from "../ui/tokens";

interface BoardStackProps {
  board: Board;
}

// Per-layer separation offsets (mm) at full explode.
const LAYER = {
  substrate: -8,
  bottom: -3,
  top: 3,
  mask: 5,
  silk: 7,
} as const;

function texFromCanvas(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export default function BoardStack({ board }: BoardStackProps): React.ReactElement | null {
  const baked: BakedLayers | null = useMemo(() => bakeBoard(board), [board.id]);

  const textures = useMemo(() => {
    if (!baked) return null;
    return {
      substrate: texFromCanvas(baked.substrate),
      copperTop: texFromCanvas(baked.copperTop),
      copperBottom: texFromCanvas(baked.copperBottom),
      mask: texFromCanvas(baked.mask),
      silk: texFromCanvas(baked.silk),
      roughness: texFromCanvas(baked.roughness),
    };
  }, [baked]);

  // Layer group refs, fanned out by the explode spring.
  const substrate = useRef<THREE.Group>(null);
  const bottom = useRef<THREE.Group>(null);
  const top = useRef<THREE.Group>(null);
  const mask = useRef<THREE.Group>(null);
  const silk = useRef<THREE.Group>(null);

  useExplodeSpring((f) => {
    if (substrate.current) substrate.current.position.z = LAYER.substrate * f;
    if (bottom.current) bottom.current.position.z = LAYER.bottom * f;
    if (top.current) top.current.position.z = LAYER.top * f;
    if (mask.current) mask.current.position.z = LAYER.mask * f;
    if (silk.current) silk.current.position.z = LAYER.silk * f;
  });

  if (!baked || !textures) return null;

  const { widthMm, heightMm, minX, minY } = baked;
  // Center of the board in three space (Y flipped).
  const cx = minX + widthMm / 2;
  const cy = -(minY + heightMm / 2);
  const th = board.thicknessMm;

  // A plane sized to the board, centered at the board center, lying in XY.
  const planeArgs: [number, number] = [widthMm, heightMm];

  return (
    <group position={[cx, cy, 0]}>
      {/* Substrate: a real 1.6 mm FR4 box so the tan edge shows on the sides. */}
      <group ref={substrate}>
        <mesh position={[0, 0, -th / 2]} castShadow receiveShadow>
          <boxGeometry args={[widthMm, heightMm, th]} />
          <meshStandardMaterial color={tokens.fr4} roughness={0.7} metalness={0.1} />
        </mesh>
        {/* Substrate top artwork (navy + dot grid) */}
        <mesh position={[0, 0, 0.002]}>
          <planeGeometry args={planeArgs} />
          <meshBasicMaterial map={textures.substrate} toneMapped={false} />
        </mesh>
      </group>

      {/* Bottom copper — self-lit so it glows through bloom */}
      <group ref={bottom}>
        <mesh position={[0, 0, -th + 0.01]} rotation={[Math.PI, 0, 0]}>
          <planeGeometry args={planeArgs} />
          <meshBasicMaterial
            map={textures.copperBottom}
            transparent
            opacity={0.7}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* Top copper — self-lit cyan traces, pads and via rings */}
      <group ref={top}>
        <mesh position={[0, 0, 0.02]}>
          <planeGeometry args={planeArgs} />
          <meshBasicMaterial
            map={textures.copperTop}
            transparent
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>

      {/* Solder mask — semi-transparent so copper reads as faint raised lines. */}
      <group ref={mask}>
        <mesh position={[0, 0, 0.04]}>
          <planeGeometry args={planeArgs} />
          <meshPhysicalMaterial
            map={textures.mask}
            roughnessMap={textures.roughness}
            color={tokens.solderMask}
            clearcoat={0.5}
            clearcoatRoughness={0.3}
            transparent
            opacity={0.95}
          />
        </mesh>
      </group>

      {/* Silkscreen */}
      <group ref={silk}>
        <mesh position={[0, 0, 0.06]}>
          <planeGeometry args={planeArgs} />
          <meshStandardMaterial map={textures.silk} transparent roughness={0.95} />
        </mesh>
      </group>
    </group>
  );
}
