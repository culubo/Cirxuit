import React, { useMemo } from "react";
import * as THREE from "three";
import type { Track } from "../model/board-model";

interface TrackStripProps {
  track: Track;
}

const LAYER_COLORS: Record<string, THREE.Color> = {
  "F.Cu": new THREE.Color("#d4a843"),   // copper yellow (front)
  "B.Cu": new THREE.Color("#c0392b"),   // copper red (back)
  "In1.Cu": new THREE.Color("#8e44ad"), // inner 1
  "In2.Cu": new THREE.Color("#2980b9"), // inner 2
};

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
export default function TrackStrip({ track }: TrackStripProps): React.ReactElement {
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

  const color = LAYER_COLORS[track.layer] ?? new THREE.Color("#d4a843");

  return (
    <mesh geometry={geometry} position={position} rotation={[0, 0, rotationZ]}>
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.6} />
    </mesh>
  );
}
