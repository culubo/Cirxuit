import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useStore } from "../store/useStore";
import AssemblyCamera from "./AssemblyCamera";
import { shouldAssemble, useAssembly } from "./assembly";
import BoardStack from "./BoardStack";
import PlacementHead from "./PlacementHead";
import PowerOnChase from "./PowerOnChase";
import FunctionLayer from "./FunctionLayer";
import { EXPLODE_MM } from "./layers";
import NetHighlight from "./NetHighlight";
import PartModel from "./parts/PartModel";
import { useExplodeSpring } from "./useExplodeSpring";
import { focusOf } from "./focus";
import SchematicOverlay from "./schematic/SchematicOverlay";
import TracePicker from "./TracePicker";

/**
 * Composes the scene: the board stack (which fans its own layers on explode),
 * the component layer lifting away above it, the selected part's nets traced
 * through the mask, and the function layer floating on top.
 * Selection focus dims every part that shares no net with the selected one.
 */
export default function SceneRoot(): React.ReactElement | null {
  const board = useStore((s) => s.board);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);

  const components = useRef<THREE.Group>(null);
  useExplodeSpring((f) => {
    if (components.current) components.current.position.z = EXPLODE_MM.parts * f;
  });

  // Boards that build themselves start the pick-and-place sequence when loaded.
  const boardId = board?.id;
  useEffect(() => {
    const current = useStore.getState().board;
    if (current && shouldAssemble(current)) useAssembly.getState().start(current);
    else useAssembly.getState().cancel();
  }, [boardId]);

  const hover = useStore((s) => s.hover);
  // Hover wins over selection while it lasts, so pointing at a symbol, wire,
  // part, or trace previews its counterparts without losing the selection.
  const target = hover ?? (selection?.kind === "part" || selection?.kind === "net" ? selection : null);
  const targetKey = target ? (target.kind === "part" ? `p:${target.ref}` : `n:${target.netId}`) : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const focus = useMemo(() => focusOf(board, target), [board, targetKey]);

  if (!board) return null;
  const hasSelection = focus.active;

  return (
    <group onClick={() => setSelection(null)}>
      <BoardStack board={board} />
      <NetHighlight board={board} nets={focus.nets} />

      <group ref={components}>
        {board.parts.map((part) => (
          <PartModel
            key={part.ref}
            part={part}
            dimmed={hasSelection && !focus.parts.has(part.ref)}
            thicknessMm={board.thicknessMm}
          />
        ))}
      </group>

      <FunctionLayer board={board} />
      <TracePicker board={board} />
      {board.schematic && <SchematicOverlay board={board} focus={focus} />}
      <PlacementHead board={board} />
      <AssemblyCamera />
      <PowerOnChase board={board} />
    </group>
  );
}
