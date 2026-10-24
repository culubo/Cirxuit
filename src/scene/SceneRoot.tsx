import React, { useRef } from "react";
import * as THREE from "three";
import { useStore } from "../store/useStore";
import BoardSlab from "./BoardSlab";
import PartMesh from "./PartMesh";
import TrackStrip from "./TrackStrip";
import { useExplodeSpring } from "./useExplodeSpring";

/**
 * Composes the scene from store state and animates the exploded-layer view.
 *
 * Each layer lives in its own group. When exploded, groups fan out along +z by
 * (layerOffset × explodeFactor). The factor is eased each frame by
 * useExplodeSpring, so dragging the slider produces a spring-like separation.
 *
 * Layer stack (bottom→top): substrate, B.Cu, F.Cu, components, function layer.
 */

// Per-layer separation offsets (mm) at full explode, along +z.
const LAYER_OFFSET = {
  substrate: -14,
  bcu: -7,
  fcu: 7,
  components: 16,
  function: 26,
} as const;

export default function SceneRoot(): React.ReactElement | null {
  const board = useStore((s) => s.board);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);

  const substrate = useRef<THREE.Group>(null);
  const bcu = useRef<THREE.Group>(null);
  const fcu = useRef<THREE.Group>(null);
  const components = useRef<THREE.Group>(null);

  useExplodeSpring((f) => {
    if (substrate.current) substrate.current.position.z = LAYER_OFFSET.substrate * f;
    if (bcu.current) bcu.current.position.z = LAYER_OFFSET.bcu * f;
    if (fcu.current) fcu.current.position.z = LAYER_OFFSET.fcu * f;
    if (components.current) components.current.position.z = LAYER_OFFSET.components * f;
  });

  if (!board) return null;

  const backTracks = board.tracks.filter((t) => t.layer === "B.Cu");
  const frontTracks = board.tracks.filter((t) => t.layer !== "B.Cu");

  // Focus set: the selected part plus every net it touches. Parts/tracks on
  // those nets stay bright; everything else dims. No selection ⇒ nothing dims.
  const selectedRef = selection?.kind === "part" ? selection.ref : null;
  const focusedNets = new Set<string>();
  const focusedParts = new Set<string>();
  if (selectedRef) {
    focusedParts.add(selectedRef);
    const sel = board.parts.find((p) => p.ref === selectedRef);
    for (const pad of sel?.pads ?? []) if (pad.netId) focusedNets.add(pad.netId);
    // Parts sharing any focused net are also in focus.
    for (const part of board.parts) {
      if (part.pads.some((pad) => pad.netId && focusedNets.has(pad.netId))) {
        focusedParts.add(part.ref);
      }
    }
  }
  const hasSelection = selectedRef !== null;
  const partDimmed = (ref: string): boolean => hasSelection && !focusedParts.has(ref);
  const trackDimmed = (netId: string): boolean => hasSelection && !focusedNets.has(netId);

  return (
    <group onClick={() => setSelection(null)}>
      {/* Substrate layer */}
      <group ref={substrate}>
        <BoardSlab outline={board.outline} thicknessMm={board.thicknessMm} />
      </group>

      {/* Back copper */}
      <group ref={bcu}>
        {backTracks.map((track, idx) => (
          <TrackStrip key={`b-${idx}`} track={track} dimmed={trackDimmed(track.netId)} />
        ))}
      </group>

      {/* Front copper */}
      <group ref={fcu}>
        {frontTracks.map((track, idx) => (
          <TrackStrip key={`f-${idx}`} track={track} dimmed={trackDimmed(track.netId)} />
        ))}
      </group>

      {/* Components */}
      <group ref={components}>
        {board.parts.map((part) => (
          <PartMesh key={part.ref} part={part} dimmed={partDimmed(part.ref)} />
        ))}
      </group>
    </group>
  );
}
