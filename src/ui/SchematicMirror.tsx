/**
 * SchematicMirror — a hidden DOM mirror of the schematic layer for tests and
 * assistive tech. Each item is a tiny transparent button that hovers and
 * clicks exactly like its 3D counterpart, and reports whether it is
 * highlighted.
 *
 *   layer-schematic            hidden unless the layer is showing
 *   schematic-symbol-<REF>     data-highlighted="true" when its part is focused
 *   schematic-wire-<netId>     one per net
 *   tether-<REF>               follows its symbol
 */
import React, { useMemo } from "react";
import { useStore } from "../store/useStore";
import { focusOf } from "../scene/focus";
import { schematicFade, SCHEMATIC_FADE_FROM } from "../scene/schematic/SchematicOverlay";

const item: React.CSSProperties = {
  width: "4px",
  height: "4px",
  padding: 0,
  margin: 0,
  border: "none",
  background: "transparent",
  opacity: 0,
  cursor: "pointer",
};

export default function SchematicMirror(): React.ReactElement | null {
  const board = useStore((s) => s.board);
  const explode = useStore((s) => s.explode);
  const show = useStore((s) => s.showSchematic);
  const opacity = useStore((s) => s.schematicOpacity);
  const hover = useStore((s) => s.hover);
  const selection = useStore((s) => s.selection);
  const setHover = useStore((s) => s.setHover);
  const clearHover = useStore((s) => s.clearHover);
  const setSelection = useStore((s) => s.setSelection);

  const target = hover ?? (selection?.kind === "part" || selection?.kind === "net" ? selection : null);
  const focus = useMemo(() => focusOf(board, target), [board, target]);

  const sch = board?.schematic;
  const nets = useMemo(() => [...new Set((sch?.wires ?? []).map((w) => w.netId))], [sch]);
  if (!board || !sch) return null;

  const visible = show && explode > SCHEMATIC_FADE_FROM;
  const refs = sch.symbols.map((s) => s.ref).filter((ref) => board.parts.some((p) => p.ref === ref));

  return (
    <div
      data-testid="layer-schematic"
      data-visible={visible ? "true" : "false"}
      data-fade={schematicFade(explode).toFixed(2)}
      data-opacity={opacity.toFixed(2)}
      hidden={!visible}
      aria-label="Schematic layer"
      style={{ position: "absolute", right: "4px", bottom: "4px", zIndex: 30, display: visible ? "flex" : "none", flexWrap: "wrap", gap: "2px", maxWidth: "120px", pointerEvents: "auto" }}
    >
      <ul aria-label="Symbols" style={{ display: "contents", listStyle: "none" }}>
        {refs.map((ref) => (
          <li key={ref} style={{ display: "contents" }}>
            <button
              data-testid={`schematic-symbol-${ref}`}
              data-highlighted={focus.primaryParts.has(ref) ? "true" : "false"}
              data-dimmed={focus.active && !focus.parts.has(ref) ? "true" : "false"}
              aria-label={`Schematic symbol ${ref}`}
              tabIndex={-1}
              onMouseEnter={() => setHover({ kind: "part", ref })}
              onMouseLeave={() => clearHover({ kind: "part", ref })}
              onClick={() => setSelection({ kind: "part", ref })}
              style={item}
            />
          </li>
        ))}
      </ul>
      <ul aria-label="Wires" style={{ display: "contents", listStyle: "none" }}>
        {nets.map((netId) => (
          <li key={netId} style={{ display: "contents" }}>
            <button
              data-testid={`schematic-wire-${netId}`}
              data-highlighted={focus.primaryNets.has(netId) ? "true" : "false"}
              data-dimmed={focus.active && !focus.nets.has(netId) ? "true" : "false"}
              aria-label={`Schematic wire ${netId}`}
              tabIndex={-1}
              onMouseEnter={() => setHover({ kind: "net", netId })}
              onMouseLeave={() => clearHover({ kind: "net", netId })}
              onClick={() => setSelection({ kind: "net", netId })}
              style={item}
            />
          </li>
        ))}
      </ul>
      <ul aria-label="Tethers" style={{ display: "contents", listStyle: "none" }}>
        {refs.map((ref) => (
          <li key={ref} style={{ display: "contents" }}>
            <span
              data-testid={`tether-${ref}`}
              data-highlighted={focus.primaryParts.has(ref) ? "true" : "false"}
              style={{ ...item, display: "inline-block", cursor: "default" }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
