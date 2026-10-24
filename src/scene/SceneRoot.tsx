import React from "react";
import { useStore } from "../store/useStore";
import BoardSlab from "./BoardSlab";
import PartMesh from "./PartMesh";
import TrackStrip from "./TrackStrip";

/**
 * Composes the full scene from store state.
 * Renders the board slab, all parts, and all copper tracks.
 * Clicking the background (canvas) clears selection.
 */
export default function SceneRoot(): React.ReactElement | null {
  const board = useStore((s) => s.board);
  const setSelection = useStore((s) => s.setSelection);

  if (!board) return null;

  return (
    <group onClick={() => setSelection(null)}>
      <BoardSlab outline={board.outline} thicknessMm={board.thicknessMm} />

      {board.tracks.map((track, idx) => (
        <TrackStrip key={`track-${idx}`} track={track} />
      ))}

      {board.parts.map((part) => (
        <PartMesh key={part.ref} part={part} />
      ))}
    </group>
  );
}
