/**
 * Shared styles for the workbench chrome: thin, dense, and quiet, so the board
 * stays the hero. All colours come from tokens.
 */
import type React from "react";
import { tokens } from "./tokens";

export const font: React.CSSProperties = { fontFamily: tokens.fontMono };

export const label: React.CSSProperties = {
  color: tokens.textFaint,
  fontSize: "0.66rem",
  textTransform: "uppercase",
  letterSpacing: "0.09em",
};

export function button(opts: { active?: boolean; primary?: boolean; danger?: boolean; disabled?: boolean } = {}): React.CSSProperties {
  const { active = false, primary = false, danger = false, disabled = false } = opts;
  const accent = danger ? tokens.danger : tokens.phosphor;
  return {
    ...font,
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    height: "26px",
    padding: "0 0.6rem",
    fontSize: "0.74rem",
    borderRadius: "3px",
    cursor: disabled ? "not-allowed" : "pointer",
    whiteSpace: "nowrap",
    opacity: disabled ? 0.45 : 1,
    color: primary || active ? "#04121f" : tokens.text,
    background: primary ? accent : active ? "#9be8ff" : "#0d1b30",
    border: `1px solid ${primary ? accent : active ? "#9be8ff" : tokens.panelBorder}`,
    fontWeight: primary ? 700 : 500,
  };
}

export const select: React.CSSProperties = {
  ...font,
  height: "26px",
  fontSize: "0.74rem",
  color: tokens.text,
  background: "#0d1b30",
  border: `1px solid ${tokens.panelBorder}`,
  borderRadius: "3px",
  padding: "0 0.4rem",
  cursor: "pointer",
};

export const severityColor = (severity: "error" | "warning" | "info"): string =>
  severity === "error" ? tokens.danger : severity === "warning" ? tokens.amber : tokens.textDim;

export const severityGlyph = (severity: "error" | "warning" | "info"): string =>
  severity === "error" ? "✕" : severity === "warning" ? "▲" : "i";
