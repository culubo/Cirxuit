/**
 * bakeBoard — render a board's fab artwork into 2D canvases, one per layer.
 *
 * Far more realistic (and far cheaper) than extruding hundreds of 3D strips: we
 * draw traces, pads, vias, mask and silkscreen into canvases at ~80 px/mm, then
 * map them onto thin planes in the scene.
 *
 * Board space is mm, origin top-left, +x right, +y down. The canvases share that
 * orientation; the scene flips Y when it maps them.
 */
import type { Board, CopperLayer, Part, Vec2 } from "../../model/board-model";

export interface BakedLayers {
  widthMm: number;
  heightMm: number;
  minX: number;
  minY: number;
  pxPerMm: number;
  substrate: HTMLCanvasElement;
  copperTop: HTMLCanvasElement;
  copperBottom: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  silk: HTMLCanvasElement;
  roughness: HTMLCanvasElement;
}

const MAX_PX = 4096;
const TARGET_PX_PER_MM = 80;

// Palette: "glowing circuit blueprint" — navy ground, electric-cyan copper.
const FR4 = "#071630";        // deep navy substrate
const FR4_DOT = "#3a6ea8";    // dot-grid points
const COPPER = "#3fb6f0";     // cyan traces
const COPPER_GLOW = "#4fd8ff";
const HASL = "#bff0ff";       // pads: near-white cyan
const MASK_GREEN = "#0a1f3d"; // (name kept) navy solder mask
const SILK = "#d8f2ff";

function bounds(outline: Vec2[]): { minX: number; minY: number; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of outline) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 50; maxY = 35; }
  return { minX, minY, w: maxX - minX, h: maxY - minY };
}

function makeCanvas(wPx: number, hPx: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(wPx));
  c.height = Math.max(1, Math.round(hPx));
  return c;
}

/** Trace outline path (board-space mm → px) as a rounded polyline for one net/layer. */
function strokeTracks(
  ctx: CanvasRenderingContext2D,
  board: Board,
  layer: CopperLayer,
  pxPerMm: number,
  minX: number,
  minY: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Soft cyan halo so traces read as lit, like a backlit blueprint.
  ctx.shadowColor = COPPER_GLOW;
  ctx.shadowBlur = Math.max(4, 0.6 * pxPerMm);
  for (const t of board.tracks) {
    if (t.layer !== layer) continue;
    ctx.lineWidth = Math.max(1, t.widthMm * pxPerMm);
    ctx.beginPath();
    ctx.moveTo((t.start.x - minX) * pxPerMm, (t.start.y - minY) * pxPerMm);
    ctx.lineTo((t.end.x - minX) * pxPerMm, (t.end.y - minY) * pxPerMm);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

/** Is this pad through-hole (on both sides) — draw it round — or SMD (rounded rect)? */
function isThrough(pad: { layers: CopperLayer[] }): boolean {
  return pad.layers.includes("F.Cu") && pad.layers.includes("B.Cu");
}

function drawPad(
  ctx: CanvasRenderingContext2D,
  pad: Part["pads"][number],
  pxPerMm: number,
  minX: number,
  minY: number,
  fill: string | CanvasGradient,
): void {
  const cx = (pad.position.x - minX) * pxPerMm;
  const cy = (pad.position.y - minY) * pxPerMm;
  const w = pad.sizeMm.w * pxPerMm;
  const h = pad.sizeMm.h * pxPerMm;
  ctx.fillStyle = fill;
  ctx.beginPath();
  if (isThrough(pad)) {
    const r = Math.max(w, h) / 2;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  } else {
    const r = Math.min(w, h) * 0.28;
    roundRect(ctx, cx - w / 2, cy - h / 2, w, h, r);
  }
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
}

function copperLayer(board: Board, layer: CopperLayer, pxPerMm: number, minX: number, minY: number): HTMLCanvasElement {
  const b = bounds(board.outline);
  const c = makeCanvas(b.w * pxPerMm, b.h * pxPerMm);
  const ctx = c.getContext("2d");
  if (!ctx) return c;

  // Traces.
  strokeTracks(ctx, board, layer, pxPerMm, minX, minY, COPPER);

  // Pads on this layer — silver HASL with a soft specular gradient.
  for (const part of board.parts) {
    for (const pad of part.pads) {
      if (!pad.layers.includes(layer)) continue;
      const cx = (pad.position.x - minX) * pxPerMm;
      const cy = (pad.position.y - minY) * pxPerMm;
      const rad = Math.max(pad.sizeMm.w, pad.sizeMm.h) * pxPerMm;
      const g = ctx.createRadialGradient(cx, cy, rad * 0.05, cx, cy, rad * 0.8);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(1, HASL);
      ctx.shadowColor = COPPER_GLOW;
      ctx.shadowBlur = Math.max(6, 0.8 * pxPerMm);
      drawPad(ctx, pad, pxPerMm, minX, minY, g);
      ctx.shadowBlur = 0;
    }
  }

  // Vias: glowing cyan ring with a dark drilled centre (the blueprint "eyelet").
  for (const via of board.vias) {
    const cx = (via.position.x - minX) * pxPerMm;
    const cy = (via.position.y - minY) * pxPerMm;
    const outer = (via.diameterMm / 2) * pxPerMm;
    ctx.shadowColor = COPPER_GLOW;
    ctx.shadowBlur = Math.max(4, 0.5 * pxPerMm);
    ctx.strokeStyle = COPPER_GLOW;
    ctx.lineWidth = Math.max(1.5, outer * 0.45);
    ctx.beginPath();
    ctx.arc(cx, cy, outer * 0.78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#030812";
    ctx.beginPath();
    ctx.arc(cx, cy, (via.drillMm / 2) * pxPerMm, 0, Math.PI * 2);
    ctx.fill();
  }

  return c;
}

export function bakeBoard(board: Board): BakedLayers | null {
  if (typeof document === "undefined") return null;
  const b = bounds(board.outline);
  const maxDim = Math.max(b.w, b.h, 1);
  const pxPerMm = Math.min(TARGET_PX_PER_MM, MAX_PX / maxDim);
  const wPx = b.w * pxPerMm;
  const hPx = b.h * pxPerMm;
  const { minX, minY } = b;

  // ── Substrate: deep navy with a radial glow and a fine dot grid ─────────────
  const substrate = makeCanvas(wPx, hPx);
  {
    const ctx = substrate.getContext("2d");
    if (ctx) {
      const sw = substrate.width, sh = substrate.height;
      const bg = ctx.createRadialGradient(sw * 0.45, sh * 0.55, 0, sw * 0.45, sh * 0.55, Math.max(sw, sh) * 0.75);
      bg.addColorStop(0, "#0f2c5c");
      bg.addColorStop(1, FR4);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, sw, sh);
      // Dot grid at 1.27 mm pitch (half of 2.54 mm), like the reference artwork.
      ctx.fillStyle = FR4_DOT;
      ctx.globalAlpha = 0.55;
      const step = 1.27 * pxPerMm;
      const r = Math.max(0.8, 0.07 * pxPerMm);
      for (let y = step / 2; y < sh; y += step) {
        for (let x = step / 2; x < sw; x += step) {
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  const copperTop = copperLayer(board, "F.Cu", pxPerMm, minX, minY);
  const copperBottom = copperLayer(board, "B.Cu", pxPerMm, minX, minY);

  // ── Mask: dark glossy green, openings over pads ─────────────────────────────
  const mask = makeCanvas(wPx, hPx);
  {
    const ctx = mask.getContext("2d");
    if (ctx) {
      ctx.fillStyle = MASK_GREEN;
      // Light tint only: the glowing copper must read through the mask.
      ctx.globalAlpha = 0.25;
      ctx.fillRect(0, 0, mask.width, mask.height);
      ctx.globalAlpha = 1;
      // Punch openings over every top pad.
      ctx.globalCompositeOperation = "destination-out";
      for (const part of board.parts) {
        for (const pad of part.pads) {
          if (!pad.layers.includes("F.Cu")) continue;
          const grown = {
            ...pad,
            sizeMm: { w: pad.sizeMm.w + 0.15, h: pad.sizeMm.h + 0.15 },
          };
          drawPad(ctx, grown, pxPerMm, minX, minY, "#000");
        }
      }
      ctx.globalCompositeOperation = "source-over";
    }
  }

  // ── Silk: outlines, refs, polarity, name, mounting holes ────────────────────
  const silk = makeCanvas(wPx, hPx);
  {
    const ctx = silk.getContext("2d");
    if (ctx) {
      ctx.strokeStyle = SILK;
      ctx.fillStyle = SILK;
      ctx.lineWidth = Math.max(1, 0.15 * pxPerMm);
      const fontPx = Math.max(8, 1.0 * pxPerMm);
      ctx.font = `${fontPx}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (const part of board.parts) {
        const cx = (part.position.x - minX) * pxPerMm;
        const cy = (part.position.y - minY) * pxPerMm;
        const w = part.body.w * pxPerMm;
        const h = part.body.h * pxPerMm;
        // Courtyard outline.
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((part.rotationDeg * Math.PI) / 180);
        ctx.globalAlpha = 0.8;
        ctx.strokeRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4);
        ctx.globalAlpha = 1;
        // Ref designator just above the part.
        ctx.fillText(part.ref, 0, -h / 2 - fontPx * 0.9);
        ctx.restore();

        // Pin-1 dot near the first pad.
        const p1 = part.pads.find((p) => p.number === "1") ?? part.pads[0];
        if (p1) {
          ctx.beginPath();
          ctx.arc((p1.position.x - minX) * pxPerMm, (p1.position.y - minY) * pxPerMm,
            Math.max(1.5, 0.25 * pxPerMm), 0, Math.PI * 2);
          ctx.fill();
        }

        // Polarity bar for LED / diode (stripe at the cathode side).
        if (part.model && (part.model.type === "led" || part.model.type === "diode")) {
          const cathodePad = part.model.cathodePad;
          const cath = part.pads.find((p) => p.number === cathodePad);
          if (cath) {
            ctx.save();
            ctx.globalAlpha = 0.9;
            ctx.fillRect((cath.position.x - minX) * pxPerMm - 1,
              (cath.position.y - minY) * pxPerMm - h / 2, 2, h);
            ctx.restore();
          }
        }
      }

      // Board name along the bottom edge.
      ctx.globalAlpha = 0.7;
      ctx.font = `${Math.max(8, 1.4 * pxPerMm)}px monospace`;
      ctx.textAlign = "left";
      ctx.fillText(board.name, 2 * pxPerMm, hPx - 1.5 * pxPerMm);
      ctx.globalAlpha = 1;

      // Four corner mounting holes.
      const m = 2.5 * pxPerMm;
      for (const [hx, hy] of [[m, m], [wPx - m, m], [m, hPx - m], [wPx - m, hPx - m]] as const) {
        ctx.beginPath();
        ctx.arc(hx, hy, 1.6 * pxPerMm, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // ── Roughness map: pads shiny (dark), mask mid, silk rough (light) ──────────
  const roughness = makeCanvas(wPx, hPx);
  {
    const ctx = roughness.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#999";          // mask ~0.6 roughness
      ctx.fillRect(0, 0, roughness.width, roughness.height);
      // Pads shinier.
      for (const part of board.parts) {
        for (const pad of part.pads) {
          if (!pad.layers.includes("F.Cu")) continue;
          drawPad(ctx, pad, pxPerMm, minX, minY, "#333");
        }
      }
    }
  }

  return { widthMm: b.w, heightMm: b.h, minX, minY, pxPerMm, substrate, copperTop, copperBottom, mask, silk, roughness };
}
