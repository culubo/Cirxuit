/**
 * BoardStack — the physical board.
 *
 * Collapsed, it is a 1.6 mm FR-4 slab with a milled edge, real drilled
 * mounting holes, and the finished top and bottom faces (mask, ENIG, silk) as
 * physically based materials: colour, roughness/metalness and bump maps baked
 * from the board data.
 *
 * Exploded, the finished faces cross-fade into the films a fab stacks up —
 * silkscreen, solder mask, top copper, the FR-4 core, bottom copper, and the
 * bottom face — each fanned out along +z and labelled.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Board } from "../model/board-model";
import { useStore } from "../store/useStore";
import { tokens } from "../ui/tokens";
import { bakeLayers, bakeSurfaces, type BakedLayers, type BakedSurfaces, type SurfaceMaps } from "./bake/bakeBoard";
import { loadSilkFont } from "./art/silkArt";
import { boardEdge, boardFace } from "./boardGeometry";
import { EXPLODE_MM, labelMix, layerMix } from "./layers";
import LabelSprite from "./LabelSprite";
import { pcb } from "./palette";
import { useExplodeSpring } from "./useExplodeSpring";

interface BoardStackProps {
  board: Board;
}

function texture(canvas: HTMLCanvasElement, color: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** A finished board face: mask, ENIG, silk, with gloss (roughness map) and relief (bump map). */
function surfaceMaterial(maps: SurfaceMaps, side: THREE.Side): THREE.MeshStandardMaterial {
  const orm = texture(maps.orm, false);
  return new THREE.MeshStandardMaterial({
    map: texture(maps.color, true),
    roughnessMap: orm,
    metalnessMap: orm,
    roughness: 1,
    metalness: 1,
    bumpMap: texture(maps.height, false),
    bumpScale: 1.6,
    side,
  });
}

const LAYER_LABELS: { key: keyof typeof EXPLODE_MM; text: string; detail: string }[] = [
  { key: "silk", text: "Silkscreen", detail: "epoxy ink" },
  { key: "mask", text: "Solder mask", detail: "LPI, ENIG openings" },
  { key: "copperTop", text: "F.Cu", detail: "35 µm copper" },
  { key: "core", text: "FR-4 core", detail: "" },
  { key: "copperBottom", text: "B.Cu", detail: "35 µm copper" },
  { key: "bottomSurface", text: "Bottom side", detail: "mask + pads" },
];

export default function BoardStack({ board }: BoardStackProps): React.ReactElement | null {
  // Bake after the board's first commit so loading a board never blocks input.
  // Artwork depends only on geometry, so parameter edits (same id) never re-bake.
  const [baked, setBaked] = useState<{ id: string; surfaces: BakedSurfaces } | null>(null);
  const boardRef = useRef(board);
  boardRef.current = board;
  useEffect(() => {
    let cancelled = false;
    // The ISO 3098 silkscreen font loads once; then bake.
    void loadSilkFont().then(() => {
      if (cancelled) return;
      const surfaces = bakeSurfaces(boardRef.current);
      if (surfaces) setBaked({ id: boardRef.current.id, surfaces });
    });
    return () => { cancelled = true; };
  }, [board.id]);
  const surfaces = baked?.id === board.id ? baked.surfaces : null;

  // The exploded films are only baked the first time someone pulls the board apart.
  const wantsLayers = useStore((s) => s.explode > 0);
  const [layers, setLayers] = useState<{ id: string; baked: BakedLayers } | null>(null);
  useEffect(() => {
    if (!wantsLayers || layers?.id === board.id) return;
    let cancelled = false;
    void loadSilkFont().then(() => {
      if (cancelled) return;
      const baked = bakeLayers(board);
      if (baked) setLayers({ id: board.id, baked });
    });
    return () => { cancelled = true; };
  }, [wantsLayers, board, layers?.id]);
  const films = layers?.id === board.id ? layers.baked : null;

  const geometry = useMemo(() => {
    if (!surfaces) return null;
    return {
      face: boardFace(board.outline, surfaces.holes, surfaces.frame),
      edge: boardEdge(board.outline, surfaces.holes, board.thicknessMm),
    };
  }, [surfaces, board.outline, board.thicknessMm]);

  const materials = useMemo(() => {
    if (!surfaces) return null;
    return {
      top: surfaceMaterial(surfaces.top, THREE.FrontSide),
      bottom: surfaceMaterial(surfaces.bottom, THREE.BackSide),
      // ExtrudeGeometry group 0 is the caps (covered by the faces), group 1 the walls.
      edge: [
        new THREE.MeshBasicMaterial({ visible: false }),
        new THREE.MeshStandardMaterial({ color: pcb.laminateEdge, roughness: 0.85, metalness: 0 }),
      ],
    };
  }, [surfaces]);

  const filmMaterials = useMemo(() => {
    if (!films) return null;
    return {
      silk: new THREE.MeshStandardMaterial({ map: texture(films.silk, true), transparent: true, alphaTest: 0.3, roughness: 0.85, depthWrite: false }),
      mask: new THREE.MeshStandardMaterial({ map: texture(films.mask, true), transparent: true, roughness: 0.3, depthWrite: false, side: THREE.DoubleSide }),
      copperTop: new THREE.MeshStandardMaterial({ map: texture(films.copperTop, true), transparent: true, alphaTest: 0.4, metalness: 0.9, roughness: 0.32, side: THREE.DoubleSide }),
      copperBottom: new THREE.MeshStandardMaterial({ map: texture(films.copperBottom, true), transparent: true, alphaTest: 0.4, metalness: 0.9, roughness: 0.32, side: THREE.DoubleSide }),
      core: new THREE.MeshStandardMaterial({ map: texture(films.core, true), transparent: true, roughness: 0.8, side: THREE.DoubleSide }),
    };
  }, [films]);

  // Release GPU memory when the board changes.
  useEffect(() => () => {
    geometry?.face.dispose();
    geometry?.edge.dispose();
  }, [geometry]);
  useEffect(() => () => {
    if (!materials) return;
    for (const m of [materials.top, materials.bottom]) {
      m.map?.dispose(); m.roughnessMap?.dispose(); m.bumpMap?.dispose(); m.dispose();
    }
    for (const m of materials.edge) m.dispose();
  }, [materials]);
  useEffect(() => () => {
    if (!filmMaterials) return;
    for (const m of Object.values(filmMaterials)) { m.map?.dispose(); m.dispose(); }
  }, [filmMaterials]);

  const topFace = useRef<THREE.Mesh>(null);
  const bottomFace = useRef<THREE.Group>(null);
  const filmRefs = {
    silk: useRef<THREE.Mesh>(null),
    mask: useRef<THREE.Mesh>(null),
    copperTop: useRef<THREE.Mesh>(null),
    copperBottom: useRef<THREE.Mesh>(null),
    coreTop: useRef<THREE.Mesh>(null),
    coreBottom: useRef<THREE.Mesh>(null),
  };
  const labelRefs = useRef<(THREE.Sprite | null)[]>([]);

  useExplodeSpring((f) => {
    const mix = layerMix(f);
    if (materials) {
      materials.top.opacity = 1 - mix;
      materials.top.transparent = mix > 0.001;
      if (topFace.current) topFace.current.visible = mix < 0.999;
    }
    if (bottomFace.current) bottomFace.current.position.z = EXPLODE_MM.bottomSurface * f;

    const place = (mesh: THREE.Mesh | null, z: number, material: THREE.Material | undefined, peak = 1): void => {
      if (!mesh) return;
      mesh.position.z = z;
      mesh.visible = mix > 0.001;
      if (material) material.opacity = mix * peak;
    };
    place(filmRefs.silk.current, 0.02 + EXPLODE_MM.silk * f, filmMaterials?.silk);
    place(filmRefs.mask.current, 0.01 + EXPLODE_MM.mask * f, filmMaterials?.mask, 0.62);
    place(filmRefs.copperTop.current, 0.005 + EXPLODE_MM.copperTop * f, filmMaterials?.copperTop);
    place(filmRefs.coreTop.current, 0.001, filmMaterials?.core);
    place(filmRefs.coreBottom.current, -board.thicknessMm - 0.001, filmMaterials?.core);
    place(filmRefs.copperBottom.current, -board.thicknessMm - 0.005 + EXPLODE_MM.copperBottom * f, filmMaterials?.copperBottom);

    const fade = labelMix(f);
    for (const sprite of labelRefs.current) {
      if (!sprite) continue;
      sprite.visible = fade > 0.001;
      (sprite.material as THREE.SpriteMaterial).opacity = fade;
    }
  });

  if (!surfaces || !geometry || !materials) return null;
  const { frame } = surfaces;
  const th = board.thicknessMm;
  // Labels hang just in front of the board's front-left corner, so they stay in
  // the open viewport whatever panels flank the canvas.
  const labelX = frame.minX + 1.5;
  const labelY = -(frame.minY + frame.heightMm) - 1.5;

  return (
    <group>
      {/* Milled FR-4 edge and hole walls */}
      <mesh geometry={geometry.edge} material={materials.edge} receiveShadow />

      {/* Finished faces */}
      <mesh ref={topFace} geometry={geometry.face} material={materials.top} receiveShadow />
      <group ref={bottomFace}>
        <mesh geometry={geometry.face} material={materials.bottom} position={[0, 0, -th]} receiveShadow />
      </group>

      {/* Exploded films */}
      {filmMaterials && (
        <>
          <mesh ref={filmRefs.silk} geometry={geometry.face} material={filmMaterials.silk} visible={false} />
          <mesh ref={filmRefs.mask} geometry={geometry.face} material={filmMaterials.mask} visible={false} />
          <mesh ref={filmRefs.copperTop} geometry={geometry.face} material={filmMaterials.copperTop} visible={false} />
          <mesh ref={filmRefs.coreTop} geometry={geometry.face} material={filmMaterials.core} visible={false} />
          <mesh ref={filmRefs.coreBottom} geometry={geometry.face} material={filmMaterials.core} visible={false} />
          <mesh ref={filmRefs.copperBottom} geometry={geometry.face} material={filmMaterials.copperBottom} visible={false} />
        </>
      )}

      {/* Layer names, shown once the stack is apart */}
      {LAYER_LABELS.map((label, i) => {
        const z = label.key === "core" ? -th / 2
          : label.key === "copperBottom" || label.key === "bottomSurface" ? -th + EXPLODE_MM[label.key]
          : EXPLODE_MM[label.key];
        return (
          <LabelSprite
            key={label.key}
            ref={(sprite) => { labelRefs.current[i] = sprite; }}
            text={label.text}
            detail={label.key === "core" ? `${th} mm` : label.detail}
            color={tokens.text}
            position={[labelX, labelY, z]}
            sizePx={10}
            rule
          />
        );
      })}
    </group>
  );
}
