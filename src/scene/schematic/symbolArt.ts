/**
 * symbolArt — draws a schematic symbol crisply into a canvas, white lines on
 * transparent, rotated as placed. Pin labels on box symbols stay upright.
 * The scene tints the white (cyan when highlighted) through the material.
 */
import type { Part } from "../../model/board-model";
import { tokens } from "../../ui/tokens";
import { BOX_HALF_W, rotateLocal, symbolHalfExtent, symbolKind, symbolPins } from "./geometry";

/** Canvas pixels per schematic millimetre. */
const PX_PER_MM = 28;
const MAX_PX = 1024;
const LINE_MM = 0.24;
const PAD_MM = 0.6;
const BOX_EDGE = BOX_HALF_W - 2.54;

export interface SymbolArt {
  canvas: HTMLCanvasElement;
  /** Half extents of the canvas in schematic mm (rotated symbol plus padding). */
  halfW: number;
  halfH: number;
}

type Ctx = CanvasRenderingContext2D;

function line(ctx: Ctx, pts: [number, number][]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
}

function arrowHead(ctx: Ctx, from: [number, number], to: [number, number], size = 0.7): void {
  const a = Math.atan2(to[1] - from[1], to[0] - from[0]);
  ctx.beginPath();
  ctx.moveTo(to[0], to[1]);
  ctx.lineTo(to[0] - size * Math.cos(a - 0.45), to[1] - size * Math.sin(a - 0.45));
  ctx.lineTo(to[0] - size * Math.cos(a + 0.45), to[1] - size * Math.sin(a + 0.45));
  ctx.closePath();
  ctx.fill();
}

function zigzag(ctx: Ctx, from: number, to: number, amp: number): void {
  const peaks = 6;
  const step = (to - from) / peaks;
  const pts: [number, number][] = [[from, 0]];
  for (let i = 0; i < peaks; i++) pts.push([from + step * (i + 0.5), i % 2 === 0 ? -amp : amp]);
  pts.push([to, 0]);
  line(ctx, pts);
}

function diodeBody(ctx: Ctx): void {
  line(ctx, [[-5, 0], [-1.5, 0]]);
  line(ctx, [[1.5, 0], [5, 0]]);
  ctx.beginPath();
  ctx.moveTo(-1.5, -1.6); ctx.lineTo(-1.5, 1.6); ctx.lineTo(1.5, 0); ctx.closePath();
  ctx.stroke();
  line(ctx, [[1.5, -1.6], [1.5, 1.6]]);
}

/** Draw the symbol at rotation 0 in local schematic mm (+y down). */
function drawLocal(ctx: Ctx, part: Part): void {
  switch (symbolKind(part)) {
    case "resistor":
      line(ctx, [[-5, 0], [-2.6, 0]]);
      zigzag(ctx, -2.6, 2.6, 1);
      line(ctx, [[2.6, 0], [5, 0]]);
      return;
    case "potentiometer":
      line(ctx, [[-5, 0], [-2.6, 0]]);
      zigzag(ctx, -2.6, 2.6, 1);
      line(ctx, [[2.6, 0], [5, 0]]);
      line(ctx, [[0, -4], [0, -1.35]]);
      arrowHead(ctx, [0, -4], [0, -1.05], 0.9);
      return;
    case "capacitor":
      line(ctx, [[-5, 0], [-0.6, 0]]);
      line(ctx, [[0.6, 0], [5, 0]]);
      line(ctx, [[-0.6, -1.8], [-0.6, 1.8]]);
      line(ctx, [[0.6, -1.8], [0.6, 1.8]]);
      return;
    case "diode":
      diodeBody(ctx);
      return;
    case "led":
      diodeBody(ctx);
      for (const dx of [0, 1.3]) {
        const from: [number, number] = [-0.2 + dx, -1.9];
        const to: [number, number] = [1.0 + dx, -3.3];
        line(ctx, [from, to]);
        arrowHead(ctx, from, to, 0.6);
      }
      return;
    case "npn": {
      line(ctx, [[-4, 0], [-1.4, 0]]);
      line(ctx, [[-1.4, -2], [-1.4, 2]]);
      line(ctx, [[-1.4, -0.8], [2, -3], [2, -5]]);
      line(ctx, [[-1.4, 0.8], [2, 3], [2, 5]]);
      arrowHead(ctx, [-1.4, 0.8], [1.3, 2.55], 0.8);
      ctx.beginPath();
      ctx.arc(0.4, 0, 3.3, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    case "vsource":
      line(ctx, [[0, -5], [0, -0.9]]);
      line(ctx, [[-2.2, -0.9], [2.2, -0.9]]);
      ctx.save();
      ctx.lineWidth = LINE_MM * 2.6;
      line(ctx, [[-1.1, 0.7], [1.1, 0.7]]);
      ctx.restore();
      line(ctx, [[0, 0.7], [0, 5]]);
      return;
    case "servo":
      line(ctx, [[-4, 0], [-2.4, 0]]);
      line(ctx, [[2.4, 0], [4, 0]]);
      ctx.beginPath();
      ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
      ctx.stroke();
      return;
    case "box": {
      const ext = symbolHalfExtent(part);
      const h = ext.y - 0.4;
      ctx.strokeRect(-BOX_EDGE, -h, BOX_EDGE * 2, h * 2);
      for (const p of symbolPins(part)) {
        const edge = p.local.x < 0 ? -BOX_EDGE : BOX_EDGE;
        line(ctx, [[p.local.x, p.local.y], [edge, p.local.y]]);
      }
      return;
    }
  }
}

/** Text that must stay upright regardless of the symbol's rotation. */
function drawUpright(ctx: Ctx, part: Part, rotationDeg: number): void {
  const kind = symbolKind(part);
  ctx.textBaseline = "middle";
  if (kind === "servo") {
    ctx.font = `bold 2.6px ${tokens.fontMono}`;
    ctx.textAlign = "center";
    ctx.fillText("M", 0, 0.15);
  }
  if (kind === "vsource") {
    const plus = rotateLocal({ x: 1.6, y: -2.6 }, rotationDeg);
    ctx.font = `1.7px ${tokens.fontMono}`;
    ctx.textAlign = "center";
    ctx.fillText("+", plus.x, plus.y);
  }
  if (kind === "box") {
    ctx.font = `1.25px ${tokens.fontMono}`;
    for (const p of symbolPins(part)) {
      // Label just inside the box edge, next to its pin.
      const inside = { x: p.local.x < 0 ? -BOX_EDGE + 0.45 : BOX_EDGE - 0.45, y: p.local.y };
      const at = rotateLocal(inside, rotationDeg);
      const dir = rotateLocal({ x: p.local.x < 0 ? 1 : -1, y: 0 }, rotationDeg);
      ctx.textAlign = Math.abs(dir.x) < 0.5 ? "center" : dir.x > 0 ? "left" : "right";
      ctx.fillText(p.label.length > 5 ? p.label.slice(0, 5) : p.label, at.x, at.y);
    }
  }
}

export function drawSymbol(part: Part, rotationDeg: number): SymbolArt | null {
  if (typeof document === "undefined") return null;
  const ext = symbolHalfExtent(part);
  const r = (rotationDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  const halfW = ext.x * c + ext.y * s + PAD_MM;
  const halfH = ext.x * s + ext.y * c + PAD_MM;
  const ppm = Math.min(PX_PER_MM, MAX_PX / (2 * Math.max(halfW, halfH)));

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(halfW * 2 * ppm);
  canvas.height = Math.ceil(halfH * 2 * ppm);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, halfW, halfH };

  ctx.scale(ppm, ppm);
  ctx.translate(halfW, halfH);
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = LINE_MM;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.save();
  // rotateLocal is counter-clockwise on screen; canvas rotate() is clockwise.
  ctx.rotate(-r);
  drawLocal(ctx, part);
  // Pin dots, so wire ends visibly land on something.
  for (const p of symbolPins(part)) {
    ctx.beginPath();
    ctx.arc(p.local.x, p.local.y, 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  drawUpright(ctx, part, rotationDeg);

  return { canvas, halfW, halfH };
}
