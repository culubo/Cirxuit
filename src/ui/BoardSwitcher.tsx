/**
 * BoardSwitcher — picks which board is loaded: the built-in boards, or the
 * user's own board from the PCB builder. Lives in the top bar.
 */
import React from "react";
import { useStore } from "../store/useStore";
import { BOARD_REGISTRY } from "../model/board-registry";
import { CUSTOM_BOARD_ID } from "../builder/doc";
import { label, select } from "./chrome";

export default function BoardSwitcher(): React.ReactElement {
  const boardId = useStore((s) => s.boardId);
  const setBoardId = useStore((s) => s.setBoardId);
  const setMode = useStore((s) => s.setMode);
  const docName = useStore((s) => s.builderDoc.name);

  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
      <span style={label}>Board</span>
      <select
        id="board-select"
        data-testid="board-switcher"
        value={boardId ?? ""}
        onChange={(e) => {
          setBoardId(e.target.value);
          // The built-in boards are read-only; building only applies to My board.
          if (e.target.value !== CUSTOM_BOARD_ID) setMode("simulate");
        }}
        style={{ ...select, minWidth: "13rem", fontSize: "0.78rem" }}
      >
        {BOARD_REGISTRY.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label}
          </option>
        ))}
        <option value={CUSTOM_BOARD_ID}>My board · {docName}</option>
      </select>
    </label>
  );
}
