import React, { useEffect } from "react";
import type { Board } from "./model/board-model";
import { solve } from "./solver/solve";
import { useStore } from "./store/useStore";
import BoardScene from "./scene/BoardScene";
import PartOverlay from "./scene/PartOverlay";
import InspectorPanel from "./ui/InspectorPanel";
import SceneErrorBoundary from "./ui/SceneErrorBoundary";

function BoardLoader(): null {
  const setBoard = useStore((s) => s.setBoard);
  const setSimResult = useStore((s) => s.setSimResult);
  const mcuState = useStore((s) => s.mcuState);

  useEffect(() => {
    // Dynamic import so Vite can tree-shake and code-split the JSON.
    void import("./model/demo-board.json").then((mod) => {
      const board = mod.default as Board;
      setBoard(board);
      setSimResult(solve(board, mcuState));
    });
    // mcuState intentionally omitted — we only want this to run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setBoard, setSimResult]);

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

      {/* HTML overlay: invisible per-part buttons for testid / a11y */}
      {board && <PartOverlay board={board} />}

      {/* Inspector panel: code editor, run button, branch currents */}
      <InspectorPanel />
    </div>
  );
}
