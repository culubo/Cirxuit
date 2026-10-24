import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Part } from "../model/board-model";
import { useStore } from "../store/useStore";
import { tokens } from "../ui/tokens";

interface PartMeshProps {
  part: Part;
  /** True when a selection exists and this part is NOT in the focused set. */
  dimmed: boolean;
}

const SELECTED_COLOR = new THREE.Color(tokens.phosphor);
const DEFAULT_COLOR = new THREE.Color("#b0a090");
const DIM_OPACITY = 0.25;
/** Rated LED current used to normalise glow brightness. */
const LED_RATED_A = 0.02;

function colorForPart(part: Part): THREE.Color {
  switch (part.kind) {
    case "resistor": return new THREE.Color("#c8a870");
    case "capacitor": return new THREE.Color("#4a6ea8");
    case "led": return new THREE.Color("#cc4444");
    case "diode": return new THREE.Color("#888888");
    case "npn": return new THREE.Color("#222228");
    case "mcu": return new THREE.Color("#15151f");
    case "vsource": return new THREE.Color("#5a3a1a");
    case "potentiometer": return new THREE.Color("#4a4a2a");
    case "connector": return new THREE.Color("#2a3a4a");
    case "servo": return new THREE.Color("#3a2a4a");
    default: return DEFAULT_COLOR;
  }
}

/**
 * A component rendered as a rounded box from its body dims.
 * - LEDs emit light with brightness proportional to their forward current.
 * - When another part is selected this part dims; the transition eases within
 *   ~200 ms via a per-frame lerp of material opacity.
 */
export default function PartMesh({ part, dimmed }: PartMeshProps): React.ReactElement {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const selection = useStore((s) => s.selection);
  const simResult = useStore((s) => s.simResult);
  const setSelection = useStore((s) => s.setSelection);

  const isSelected = selection?.kind === "part" && selection.ref === part.ref;
  const baseColor = useMemo(() => colorForPart(part), [part]);

  // LED glow: emissive intensity ∝ current / rated.
  const ledGlow = useMemo(() => {
    if (part.model?.type !== "led") return 0;
    const amps = simResult?.branches.find((b) => b.ref === part.ref)?.amps ?? 0;
    return Math.min(1.5, (amps / LED_RATED_A) * 1.5);
  }, [part.model, part.ref, simResult]);

  const rotRad = (part.rotationDeg * Math.PI) / 180;
  const zPos = part.side === "top" ? 0.1 : -part.body.height - 0.1;

  // Ease opacity toward the dim target each frame (~200 ms settle at 60 fps).
  useFrame((_, delta) => {
    const mat = matRef.current;
    if (!mat) return;
    const targetOpacity = dimmed ? DIM_OPACITY : 1;
    const k = 1 - Math.exp(-delta / 0.06); // ~200 ms to converge
    mat.opacity += (targetOpacity - mat.opacity) * k;
    mat.transparent = mat.opacity < 0.99;
  });

  function handleClick(e: THREE.Event): void {
    (e as unknown as { stopPropagation: () => void }).stopPropagation();
    setSelection({ kind: "part", ref: part.ref });
  }

  const emissiveColor = isSelected
    ? SELECTED_COLOR
    : part.model?.type === "led"
      ? baseColor
      : new THREE.Color(0x000000);
  const emissiveIntensity = isSelected ? 0.18 : part.model?.type === "led" ? ledGlow : 0;

  return (
    <mesh
      position={[part.position.x, -part.position.y, zPos]}
      rotation={[0, 0, -rotRad]}
      onClick={handleClick}
      castShadow
    >
      <boxGeometry args={[part.body.w, part.body.h, part.body.height]} />
      <meshStandardMaterial
        ref={matRef}
        color={isSelected ? SELECTED_COLOR : baseColor}
        roughness={0.5}
        metalness={part.kind === "mcu" || part.kind === "npn" ? 0.35 : 0.12}
        emissive={emissiveColor}
        emissiveIntensity={emissiveIntensity}
        toneMapped={part.model?.type !== "led"}
      />
    </mesh>
  );
}
