/**
 * TopBar — app name, board picker, Simulate / Build PCB mode switch, and the
 * guide and help toggles.
 */
import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { CUSTOM_BOARD_ID } from "../builder/doc";
import BoardSwitcher from "../ui/BoardSwitcher";
import { button, font } from "../ui/chrome";
import { tokens } from "../ui/tokens";
import { orbUrl } from "../ui/brand/Mascot";
import { useIntro } from "../ui/brand/intro";
import { loadSilkFont, SILK_FONT_FAMILY } from "../scene/art/silkArt";
import { useLayerSheets } from "../ui/LayerSheets";

const SHORTCUTS: [string, string][] = [
  ["⌘/Ctrl + Enter", "Build and run the sketch"],
  ["F10", "Step: run one pin call at a time"],
  ["Click a part", "Inspect it; everything off its nets dims"],
  ["Build PCB · W", "Wire tool: click a pad, then another pad"],
  ["Build PCB · R", "Rotate the selected part"],
  ["Build PCB · Delete", "Delete the selected part or wire"],
  ["Build PCB · Esc", "Cancel the current wire or placement"],
];

export default function TopBar(): React.ReactElement {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const boardId = useStore((s) => s.boardId);
  const boardName = useStore((s) => s.board?.name ?? "");
  const builderDoc = useStore((s) => s.builderDoc);
  const setBuilderDoc = useStore((s) => s.setBuilderDoc);
  const ownBoard = boardId === CUSTOM_BOARD_ID;
  const setBoardId = useStore((s) => s.setBoardId);
  const guideOpen = useStore((s) => s.guideOpen);
  const setGuideOpen = useStore((s) => s.setGuideOpen);
  const [helpOpen, setHelpOpen] = useState(false);
  const setIntroOpen = useIntro((s) => s.setOpen);
  const boardBeforeBuild = useRef<string | null>(null);
  // The wordmark is set in ISO 3098 lettering, the same face as the silkscreen.
  useEffect(() => { void loadSilkFont(); }, []);

  const tab = (id: "simulate" | "build", text: string, title: string): React.ReactElement => (
    <button
      role="tab"
      aria-selected={mode === id}
      data-testid={`mode-${id}`}
      title={title}
      onClick={() => {
        if (id === "build") {
          if (boardId !== CUSTOM_BOARD_ID) {
            boardBeforeBuild.current = boardId;
            setBoardId(CUSTOM_BOARD_ID);
          } else boardBeforeBuild.current = null;
          useLayerSheets.getState().setOpen(false);
        } else if (mode === "build" && boardId === CUSTOM_BOARD_ID && boardBeforeBuild.current) {
          setBoardId(boardBeforeBuild.current);
        }
        setMode(id);
      }}
      style={{
        ...font,
        height: "28px",
        padding: "0 0.9rem",
        fontSize: "0.76rem",
        border: "none",
        borderRadius: "3px",
        cursor: "pointer",
        background: mode === id ? "#12335a" : "transparent",
        color: mode === id ? tokens.text : tokens.textDim,
        boxShadow: mode === id ? `inset 0 -2px 0 ${tokens.phosphor}` : "none",
      }}
    >
      {text}
    </button>
  );

  return (
    <header
      style={{ position: "relative", display: "flex", alignItems: "center", gap: "1rem", height: "44px", padding: "0 0.75rem", borderBottom: `1px solid ${tokens.panelBorder}`, background: "#071426" }}
    >
      <div style={{ ...font, display: "flex", alignItems: "center", gap: "0.45rem" }}>
        <button
          data-testid="intro-open"
          onClick={() => setIntroOpen(true)}
          title="About Circxit"
          style={{ display: "flex", alignItems: "center", gap: "0.45rem", padding: 0, background: "transparent", border: "none", cursor: "pointer" }}
        >
          <img src={orbUrl} alt="" aria-hidden="true" width={26} height={26} style={{ display: "block" }} />
          <span style={{ fontFamily: SILK_FONT_FAMILY, color: tokens.text, fontSize: "1.02rem", letterSpacing: "0.03em" }}>Circxit</span>
        </button>
      </div>

      <BoardSwitcher />

      {/* Your own board takes a name here (the same name the Build PCB sidebar edits);
          built-in boards show theirs read-only. */}
      {ownBoard ? (
        <input
          data-testid="board-name"
          aria-label="Board name"
          value={builderDoc.name}
          maxLength={40}
          placeholder="Name your board"
          onChange={(e) => setBuilderDoc({ ...builderDoc, name: e.target.value })}
          title="Name your board. It prints on the silkscreen and the exported file."
          style={{ ...font, width: "13rem", height: "26px", padding: "0 0.5rem", fontSize: "0.76rem", color: tokens.text, background: "#06101c", border: `1px solid ${tokens.hairline}`, borderRadius: "3px" }}
        />
      ) : (
        <span
          data-testid="board-name"
          title="Built-in boards keep their names. Pick My board in the Board menu to name your own."
          style={{ ...font, maxWidth: "16rem", fontSize: "0.74rem", color: tokens.textDim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {boardName}
        </span>
      )}

      <div role="tablist" aria-label="Mode" style={{ display: "flex", gap: "0.2rem", padding: "2px", border: `1px solid ${tokens.hairline}`, borderRadius: "4px" }}>
        {tab("simulate", "Simulate", "Run firmware against the board and watch the circuit")}
        {tab("build", "Build PCB", "Place parts and wire your own board")}
      </div>

      <span style={{ flex: 1 }} />

      <button data-testid="guide-toggle" onClick={() => setGuideOpen(!guideOpen)} style={button({ active: guideOpen })}>
        ☰ Guide
      </button>
      <button data-testid="help-toggle" aria-expanded={helpOpen} onClick={() => setHelpOpen(!helpOpen)} style={button({ active: helpOpen })}>
        ?
      </button>

      {helpOpen && (
        <div
          data-testid="help-panel"
          role="dialog"
          aria-label="Keyboard shortcuts"
          style={{ position: "absolute", top: "40px", right: "0.75rem", zIndex: 40, width: "22rem", background: tokens.panel, border: `1px solid ${tokens.panelBorder}`, borderRadius: "4px", padding: "0.7rem 0.8rem", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}
        >
          <div style={{ ...font, fontSize: "0.72rem", color: tokens.text, marginBottom: "0.5rem" }}>
            Write firmware on the left, watch the board in the middle, inspect parts on the right. Problems with
            the code, the board, or the circuit show in the status bar and the Problems tab.
          </div>
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} style={{ ...font, display: "flex", justifyContent: "space-between", gap: "1rem", fontSize: "0.7rem", lineHeight: 1.7 }}>
              <span style={{ color: tokens.phosphor }}>{k}</span>
              <span style={{ color: tokens.textDim, textAlign: "right" }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}
