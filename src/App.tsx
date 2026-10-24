import React, { useEffect } from "react";
import { solve } from "./solver/solve";
import { useStore } from "./store/useStore";
import { boardEntry, DEFAULT_BOARD_ID } from "./model/board-registry";
import { CUSTOM_BOARD_ID, docToBoard, type BuilderDoc } from "./builder/doc";
import BoardScene from "./scene/BoardScene";
import InspectorPanel from "./ui/InspectorPanel";
import SceneControls from "./ui/SceneControls";
import SchematicMirror from "./ui/SchematicMirror";
import RobotHud from "./robot/RobotHud";
import LayerSheets from "./ui/LayerSheets";
import SceneErrorBoundary from "./ui/SceneErrorBoundary";
import { tokens } from "./ui/tokens";
import TopBar from "./ide/TopBar";
import EditorPane from "./ide/EditorPane";
import StatusBar from "./ide/StatusBar";
import { useProblems } from "./ide/useProblems";
import { useRunner } from "./ide/useRunner";
import GuideCard from "./guide/GuideCard";
import IntroPanel from "./ui/brand/IntroPanel";
import PaneResizer, { usePaneWidth } from "./ui/PaneResizer";
import { backdrop } from "./ui/chrome";
import BuilderView from "./builder/BuilderView";
import BuilderSidebar from "./builder/BuilderSidebar";

/** Short content hash so the derived board's id changes whenever the user edits it. */
function docHash(doc: BuilderDoc): string {
  const text = JSON.stringify(doc);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function customBoard(doc: BuilderDoc): ReturnType<typeof docToBoard> {
  return { ...docToBoard(doc), id: `${CUSTOM_BOARD_ID}@${docHash(doc)}` };
}

/**
 * Loads the board selected by `boardId`, re-solves it, and writes board and
 * simResult into the store. For My board, the board is derived from the
 * builder document and re-derived live as it is edited.
 */
function BoardLoader(): null {
  const boardId = useStore((s) => s.boardId);
  const setBoardId = useStore((s) => s.setBoardId);
  const setBoard = useStore((s) => s.setBoard);
  const setSimResult = useStore((s) => s.setSimResult);
  const resetRuntimeState = useStore((s) => s.resetRuntimeState);
  const builderDoc = useStore((s) => s.builderDoc);

  // Pick a default board on first mount.
  useEffect(() => {
    if (boardId === null) setBoardId(DEFAULT_BOARD_ID);
  }, [boardId, setBoardId]);

  // Fresh board: clear any prior selection / run state, then load and solve.
  useEffect(() => {
    if (boardId === null) return;
    resetRuntimeState();
    if (boardId === CUSTOM_BOARD_ID) {
      const board = customBoard(useStore.getState().builderDoc);
      setBoard(board);
      setSimResult(solve(board, { modes: {}, outputs: {} }));
      return;
    }
    const entry = boardEntry(boardId);
    if (!entry) return;
    let cancelled = false;
    void entry.load().then((board) => {
      if (cancelled) return;
      setBoard(board);
      setSimResult(solve(board, { modes: {}, outputs: {} }));
    });
    return () => { cancelled = true; };
  }, [boardId, setBoard, setSimResult, resetRuntimeState]);

  // My board: keep the derived board in step with builder edits.
  useEffect(() => {
    if (boardId !== CUSTOM_BOARD_ID) return;
    const s = useStore.getState();
    const board = customBoard(builderDoc);
    if (s.board?.id === board.id) return;
    s.setBoard(board);
    s.setSimResult(solve(board, s.mcuState));
    s.setPlayback(null);
  }, [boardId, builderDoc]);

  return null;
}

// Side pane widths (px): default, minimum, maximum.
const EDITOR_PANE = { fallback: 420, min: 280, max: 720 };
const INSPECTOR_PANE = { fallback: 340, min: 260, max: 600 };

export default function App(): React.ReactElement {
  const mode = useStore((s) => s.mode);
  const [editorWidth, setEditorWidth] = usePaneWidth("editor", EDITOR_PANE.fallback, EDITOR_PANE.min, EDITOR_PANE.max);
  const [inspectorWidth, setInspectorWidth] = usePaneWidth("inspector", INSPECTOR_PANE.fallback, INSPECTOR_PANE.min, INSPECTOR_PANE.max);
  const problems = useProblems();
  const runner = useRunner();

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: tokens.bg, color: tokens.text }}>
      <BoardLoader />
      <TopBar />

      <main style={{ position: "relative", flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: `${editorWidth}px minmax(0, 1fr) ${inspectorWidth}px` }}>
        <EditorPane runner={runner} problems={problems} />

        <section aria-label={mode === "build" ? "Board editor" : "Board view"} style={{ position: "relative", minWidth: 0, minHeight: 0, background: backdrop }}>
          {mode === "build" ? (
            <BuilderView />
          ) : (
            <>
              <SceneErrorBoundary>
                <BoardScene />
              </SceneErrorBoundary>
              <SceneControls />
              <SchematicMirror />
              <RobotHud />
              <LayerSheets />
            </>
          )}
          <GuideCard problems={problems.all} placement={mode === "build" ? "bottom" : "top"} />
          <IntroPanel />
        </section>

        {mode === "build" ? <BuilderSidebar boardProblems={problems.board} /> : <InspectorPanel />}

        <PaneResizer side="left" label="Resize the code editor" width={editorWidth} {...EDITOR_PANE} onResize={setEditorWidth} />
        <PaneResizer side="right" label="Resize the inspector" width={inspectorWidth} {...INSPECTOR_PANE} onResize={setInspectorWidth} />
      </main>

      <StatusBar problems={problems} />
    </div>
  );
}
