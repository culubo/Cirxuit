/** Custom accessible board picker; avoids platform-native select chrome. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { BOARD_REGISTRY } from "../model/board-registry";
import { CUSTOM_BOARD_ID } from "../builder/doc";
import { button, label } from "./chrome";
import { tokens } from "./tokens";

interface Option { id: string; label: string }

export default function BoardSwitcher(): React.ReactElement {
  const boardId = useStore((s) => s.boardId);
  const setBoardId = useStore((s) => s.setBoardId);
  const setMode = useStore((s) => s.setMode);
  const docName = useStore((s) => s.builderDoc.name);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const options = useMemo<Option[]>(() => [
    ...BOARD_REGISTRY.map(({ id, label: name }) => ({ id, label: name })),
    { id: CUSTOM_BOARD_ID, label: `My board · ${docName}` },
  ], [docName]);
  const selected = options.find((option) => option.id === boardId) ?? options[0]!;

  useEffect(() => {
    if (!open) return;
    const index = Math.max(0, options.findIndex((option) => option.id === boardId));
    setActive(index);
    window.requestAnimationFrame(() => list.current?.focus());
    const outside = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [open, boardId, options]);

  const choose = (id: string): void => {
    setBoardId(id);
    if (id !== CUSTOM_BOARD_ID) setMode("simulate");
    setOpen(false);
    window.requestAnimationFrame(() => trigger.current?.focus());
  };

  const move = (delta: number): void => setActive((index) => (index + delta + options.length) % options.length);

  return (
    <div ref={root} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
      <span id="board-select-label" style={label}>Board</span>
      <button
        ref={trigger}
        id="board-select"
        type="button"
        data-testid="board-switcher"
        data-value={boardId ?? ""}
        aria-labelledby="board-select-label board-select-value"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="board-listbox"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        style={{ ...button({ active: open }), width: "13rem", justifyContent: "space-between", fontSize: "0.78rem" }}
      >
        <span id="board-select-value" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{selected.label}</span>
        <span aria-hidden="true" style={{ color: tokens.textFaint }}>⌄</span>
      </button>

      {open && (
        <div
          ref={list}
          id="board-listbox"
          role="listbox"
          tabIndex={-1}
          aria-label="Boards"
          aria-activedescendant={`board-option-${options[active]?.id}`}
          className="cx-enter cx-board-listbox"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
            else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
            else if (event.key === "Home") { event.preventDefault(); setActive(0); }
            else if (event.key === "End") { event.preventDefault(); setActive(options.length - 1); }
            else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(options[active]!.id); }
            else if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
            else if (event.key === "Tab") setOpen(false);
          }}
          style={{ position: "absolute", top: "calc(100% + 5px)", left: "3.4rem", zIndex: 80, width: "16rem", padding: "0.3rem", background: tokens.panelRaised, border: `1px solid ${tokens.panelBorder}`, borderRadius: "6px", boxShadow: "0 12px 32px rgba(0,0,0,0.55)", outline: "none" }}
        >
          {options.map((option, index) => {
            const isSelected = option.id === boardId;
            const isActive = index === active;
            return (
              <button
                key={option.id}
                id={`board-option-${option.id}`}
                type="button"
                role="option"
                data-testid={`board-option-${option.id}`}
                data-value={option.id}
                aria-selected={isSelected}
                onPointerMove={() => setActive(index)}
                onClick={() => choose(option.id)}
                style={{ width: "100%", padding: "0.45rem 0.55rem", textAlign: "left", color: isSelected ? tokens.phosphor : tokens.text, background: isActive ? tokens.controlActiveSoft : "transparent", border: "none", borderLeft: `2px solid ${isSelected ? tokens.phosphor : "transparent"}`, borderRadius: "3px", cursor: "pointer" }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
