import React, { useEffect } from "react";
import { solve } from "./solver/solve";
import { useStore } from "./store/useStore";
import { boardEntry, DEFAULT_BOARD_ID } from "./model/board-registry";
import BoardScene from "./scene/BoardScene";
import PartOverlay from "./scene/PartOverlay";
import InspectorPanel from "./ui/InspectorPanel";
import BoardSwitcher from "./ui/BoardSwitcher";
import SceneErrorBoundary from "./ui/SceneErrorBoundary";

/**
 * Loads the board selected by `boardId` from the registry, re-solves it, and
 * writes board + simResult into the store.  Runs whenever the id changes, so the
 * board switcher simply sets a new id.
 */
function BoardLoader(): null {
  const boardId = useStore((s) => s.boardId);
  const setBoardId = useStore((s) => s.setBoardId);
  const setBoard = useStore((s) => s.setBoard);
  const setSimResult = useStore((s) => s.setSimResult);
  const resetRuntimeState = useStore((s) => s.resetRuntimeState);

  // Pick a default board on first mount.
  useEffect(() => {
    if (boardId === null) setBoardId(DEFAULT_BOARD_ID);
  }, [boardId, setBoardId]);

  useEffect(() => {
    if (boardId === null) return;
    const entry = boardEntry(boardId);
    if (!entry) return;

    let cancelled = false;
    void entry.load().then((board) => {
      if (cancelled) return;
      // Fresh board: clear any prior selection / code state, then solve.
      resetRuntimeState();
      setBoard(board);
      setSimResult(solve(board, { modes: {}, outputs: {} }));
    });
    return () => { cancelled = true; };
  }, [boardId, setBoard, setSimResult, resetRuntimeState]);

  return null;
}

export default function App(): React.ReactElement {
  const board = useStore((s) => s.board);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#0d1117",
        position: "relative",
      }}
    >
      <BoardLoader />

      <SceneErrorBoundary>
        <BoardScene />
      </SceneErrorBoundary>

      {/* Board switcher (top-left) */}
      <BoardSwitcher />

      {/* HTML overlay: invisible per-part buttons for pointer parity / a11y */}
      {board && <PartOverlay board={board} />}

      {/* Inspector panel: parts list, code editor, run button, branch currents */}
      <InspectorPanel />
    </div>
  );
}
