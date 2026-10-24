import React, { useRef } from "react";
import * as THREE from "three";
import { useStore } from "../store/useStore";
import BoardStack from "./BoardStack";
import PartMesh from "./PartMesh";
import { useExplodeSpring } from "./useExplodeSpring";

/**
 * Composes the scene: the textured board stack (which fans its own layers on
 * explode) plus the component layer, which lifts away from the board as the
 * explode factor rises. Selection focus dims everything off the selected net.
 */

const COMPONENT_LIFT = 16; // mm at full explode

export default function SceneRoot(): React.ReactElement | null {
  const board = useStore((s) => s.board);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);

  const components = useRef<THREE.Group>(null);
  useExplodeSpring((f) => {
    if (components.current) components.current.position.z = COMPONENT_LIFT * f;
  });

  if (!board) return null;

  // Focus set: the selected part plus every part sharing one of its nets.
  const selectedRef = selection?.kind === "part" ? selection.ref : null;
  const focusedParts = new Set<string>();
  if (selectedRef) {
    focusedParts.add(selectedRef);
    const sel = board.parts.find((p) => p.ref === selectedRef);
    const nets = new Set<string>();
    for (const pad of sel?.pads ?? []) if (pad.netId) nets.add(pad.netId);
    for (const part of board.parts) {
      if (part.pads.some((pad) => pad.netId && nets.has(pad.netId))) focusedParts.add(part.ref);
    }
  }
  const hasSelection = selectedRef !== null;
  const partDimmed = (ref: string): boolean => hasSelection && !focusedParts.has(ref);

  return (
    <group onClick={() => setSelection(null)}>
      <BoardStack board={board} />

      <group ref={components}>
        {board.parts.map((part) => (
          <PartMesh key={part.ref} part={part} dimmed={partDimmed(part.ref)} />
        ))}
      </group>
    </group>
  );
}
