import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Track } from "../model/board-model";
import { copperMaterial } from "./materials";

interface TrackStripProps {
  track: Track;
  /** True when a selection exists and this track is not on a focused net. */
  dimmed: boolean;
}

const DIM_OPACITY = 0.18;

const LAYER_Z: Record<string, number> = {
  "F.Cu": 0.05,
  "B.Cu": -1.65,  // below 1.6mm board
  "In1.Cu": -0.5,
  "In2.Cu": -1.1,
};

/**
 * Renders a single copper track as a flat rectangular strip.
 * Positioned mid-way between start and end, rotated to align with the track direction.
 */
export default function TrackStrip({ track, dimmed }: TrackStripProps): React.ReactElement {
  const { geometry, position, rotationZ } = useMemo(() => {
    const dx = track.end.x - track.start.x;
    const dy = track.end.y - track.start.y; // in board space (+y down)
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 0.001) {
      return {
        geometry: new THREE.BoxGeometry(0, 0, 0),
        position: new THREE.Vector3(0, 0, 0),
        rotationZ: 0,
      };
    }

    // Three.js: flip Y
    const midX = (track.start.x + track.end.x) / 2;
    const midY = -((track.start.y + track.end.y) / 2);
    const zPos = LAYER_Z[track.layer] ?? 0.05;

    // Angle in Three.js space (Y flipped)
    const angle = Math.atan2(-(track.end.y - track.start.y), dx);

    return {
      geometry: new THREE.BoxGeometry(length, track.widthMm, 0.02),
      position: new THREE.Vector3(midX, midY, zPos),
      rotationZ: angle,
    };
  }, [track]);

  const material = useMemo(() => copperMaterial(track.layer === "B.Cu"), [track.layer]);

  // Ease opacity toward the dim target when the track is off the focused net.
  useFrame((_, delta) => {
    const targetOpacity = dimmed ? DIM_OPACITY : 1;
    const k = 1 - Math.exp(-delta / 0.06); // ~200 ms settle
    material.opacity += (targetOpacity - material.opacity) * k;
    material.transparent = material.opacity < 0.99;
  });

  return (
    <mesh geometry={geometry} position={position} rotation={[0, 0, rotationZ]} material={material} />
  );
}
