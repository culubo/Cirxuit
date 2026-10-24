/**
 * BoardSwitcher — top-left control to pick which built-in board is loaded.
 *
 * Changing the selection sets boardId in the store; BoardLoader reacts by
 * importing the board, resetting runtime state, and re-solving.
 */
import React from "react";
import { useStore } from "../store/useStore";
import { BOARD_REGISTRY } from "../model/board-registry";

const wrap: React.CSSProperties = {
  position: "absolute",
  top: "1rem",
  left: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  fontFamily: "monospace",
  color: "#8aa88a",
  zIndex: 10,
  background: "#0d1117",
  border: "1px solid #2a6a2a",
  borderRadius: "4px",
  padding: "0.6rem 0.8rem",
  boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
};

const label: React.CSSProperties = {
  color: "#7ec8a0",
  fontSize: "0.72rem",
  fontWeight: "bold",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
};

export default function BoardSwitcher(): React.ReactElement {
  const boardId = useStore((s) => s.boardId);
  const setBoardId = useStore((s) => s.setBoardId);

  return (
    <div style={wrap}>
      <label htmlFor="board-select" style={label}>Board</label>
      <select
        id="board-select"
        data-testid="board-switcher"
        value={boardId ?? ""}
        onChange={(e) => setBoardId(e.target.value)}
        style={{
          background: "#08100a",
          border: "1px solid #2a6a2a",
          borderRadius: "2px",
          color: "#c8d8c8",
          fontFamily: "monospace",
          fontSize: "0.85rem",
          padding: "0.4rem 0.6rem",
          cursor: "pointer",
          minWidth: "14rem",
        }}
      >
        {BOARD_REGISTRY.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label}
          </option>
        ))}
      </select>
    </div>
  );
}
