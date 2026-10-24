/**
 * PartOverlay — invisible HTML buttons layered over the canvas, one per part.
 *
 * Why: @react-three/fiber meshes live in WebGL and have no DOM nodes.
 * Playwright's getByTestId needs real DOM elements.  These zero-size,
 * visually-hidden buttons satisfy that requirement without affecting the visual
 * scene.  Clicking one sets the same selection state as clicking the 3D mesh.
 */
import React from "react";
import type { Board } from "../model/board-model";
import { useStore } from "../store/useStore";

interface PartOverlayProps {
  board: Board;
}

const srOnly: React.CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
  // Visually hidden but still reachable by Playwright / assistive tech.
  // NOT display:none or visibility:hidden — those hide from AT and Playwright.
};

export default function PartOverlay({ board }: PartOverlayProps): React.ReactElement {
  const setSelection = useStore((s) => s.setSelection);

  return (
    <div aria-hidden="false" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {board.parts.map((part) => (
        <button
          key={part.ref}
          // No data-testid here: the canonical part-<REF> selector lives on the
          // InspectorPanel parts list. This overlay only mirrors the 3D click
          // target for pointer parity and keeps an accessible name.
          aria-label={`Select ${part.ref} (${part.value})`}
          style={{ ...srOnly, pointerEvents: "auto" }}
          onClick={() => setSelection({ kind: "part", ref: part.ref })}
        />
      ))}
    </div>
  );
}
