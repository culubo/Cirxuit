import type { Board } from "../../model/board-model";
import { tokens } from "../../ui/tokens";
import { netColor } from "../../ui/semanticColors";
import { shortValue } from "./geometry";
import { drawSymbol } from "./symbolArt";

const WIDTH_PX = 1400;
const MARGIN_PX = 72;

/** Render the authored logical schematic to a flat canvas for the layer gallery. */
export function bakeSchematic(board: Board): HTMLCanvasElement | null {
  const schematic = board.schematic;
  if (!schematic || schematic.size.w <= 0 || schematic.size.h <= 0 || typeof document === "undefined") return null;

  const scale = (WIDTH_PX - MARGIN_PX * 2) / schematic.size.w;
  const height = Math.ceil(schematic.size.h * scale + MARGIN_PX * 2);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH_PX;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const at = (n: number): number => MARGIN_PX + n * scale;
  ctx.fillStyle = tokens.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.lineWidth = Math.max(2, scale * 0.22);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const wire of schematic.wires) {
    if (wire.points.length < 2) continue;
    ctx.strokeStyle = netColor(board, wire.netId);
    ctx.beginPath();
    wire.points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(at(point.x), at(point.y));
      else ctx.lineTo(at(point.x), at(point.y));
    });
    ctx.stroke();
  }

  for (const symbol of schematic.symbols) {
    const part = board.parts.find((candidate) => candidate.ref === symbol.ref);
    if (!part) continue;
    const art = drawSymbol(part, symbol.rotationDeg);
    if (!art) continue;
    const width = art.halfW * 2 * scale;
    const heightPx = art.halfH * 2 * scale;
    const x = at(symbol.position.x);
    const y = at(symbol.position.y);
    ctx.drawImage(art.canvas, x - width / 2, y - heightPx / 2, width, heightPx);

    ctx.font = `600 ${Math.max(16, scale * 1.8)}px ${tokens.fontMono}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = tokens.silk;
    ctx.fillText(part.ref, x - width / 2, y - heightPx / 2 - 5);
    const value = shortValue(part.value);
    if (value) {
      ctx.font = `400 ${Math.max(13, scale * 1.35)}px ${tokens.fontMono}`;
      ctx.fillStyle = tokens.textDim;
      ctx.textBaseline = "top";
      ctx.fillText(value, x - width / 2, y + heightPx / 2 + 5);
    }
  }

  return canvas;
}
