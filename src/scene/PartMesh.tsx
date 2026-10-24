import React, { useRef } from "react";
import * as THREE from "three";
import type { Part } from "../model/board-model";
import { useStore } from "../store/useStore";

interface PartMeshProps {
  part: Part;
}

const SELECTED_COLOR = new THREE.Color("#7ec8a0"); // phosphor green accent
const DEFAULT_COLOR = new THREE.Color("#b0a090");  // neutral tan
const HOVERED_COLOR = new THREE.Color("#d4c89a");

function colorForPart(part: Part): THREE.Color {
  switch (part.kind) {
    case "resistor": return new THREE.Color("#c8a870");
    case "capacitor": return new THREE.Color("#4a6ea8");
    case "led": return new THREE.Color("#cc4444");
    case "diode": return new THREE.Color("#888888");
    case "npn": return new THREE.Color("#333333");
    case "mcu": return new THREE.Color("#1a1a2e");
    case "vsource": return new THREE.Color("#5a3a1a");
    case "potentiometer": return new THREE.Color("#4a4a2a");
    case "connector": return new THREE.Color("#2a3a4a");
    default: return DEFAULT_COLOR;
  }
}

/**
 * Renders a single component as a box using its body dimensions.
 * Positioned in board space (KiCad: +x right, +y down) converted to Three.js (+y up).
 * Click dispatches a selection to the store.
 */
export default function PartMesh({ part }: PartMeshProps): React.ReactElement {
  const meshRef = useRef<THREE.Mesh>(null);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);

  const isSelected =
    selection !== null &&
    selection.kind === "part" &&
    selection.ref === part.ref;

  const baseColor = colorForPart(part);
  const displayColor = isSelected ? SELECTED_COLOR : baseColor;

  const rotRad = (part.rotationDeg * Math.PI) / 180;
  const zPos = part.side === "top" ? 0.1 : -part.body.height - 0.1;

  function handleClick(e: THREE.Event): void {
    // Prevent event bubbling to parent canvas click-to-deselect
    (e as unknown as { stopPropagation: () => void }).stopPropagation();
    setSelection({ kind: "part", ref: part.ref });
  }

  return (
    <mesh
      ref={meshRef}
      position={[part.position.x, -part.position.y, zPos]}
      rotation={[0, 0, -rotRad]}
      onClick={handleClick}
    >
      <boxGeometry args={[part.body.w, part.body.h, part.body.height]} />
      <meshStandardMaterial
        color={displayColor}
        roughness={0.5}
        metalness={isSelected ? 0.3 : 0.1}
        emissive={isSelected ? SELECTED_COLOR : new THREE.Color(0x000000)}
        emissiveIntensity={isSelected ? 0.15 : 0}
      />
    </mesh>
  );
}

export { HOVERED_COLOR };
