/**
 * bakeBoard — render a board's fab artwork into canvases.
 *
 * Two products:
 *   • bakeSurfaces: the finished top and bottom faces as a real fab ships them
 *     (green LPI mask over copper, ENIG pads in the mask openings, tented vias,
 *     white silkscreen clipped off the pads), each with a colour map, an ORM map
 *     (G = roughness, B = metalness) and a height map for bump shading.
 *   • bakeLayers: the individual layers for the exploded x-ray view (bare
 *     copper per side, the mask sheet with its openings, the silk film, and the
 *     FR-4 core).
 *
 * Board space is mm, origin top-left, +x right, +y down; the canvases share
 * that orientation (row 0 = board top edge).
 */
import type { Board, CopperLayer, Pad, Part, Vec2 } from "../../model/board-model";
import { mountingHoles, outlineBounds, type MountingHole } from "../boardFeatures";
import {
  chipSize,
  drillFor,
  isThroughHole,
  landPattern,
  packageFamily,
  qfpGeometry,
  toBoard,
} from "../footprint";
import { SILK_FONT_FAMILY } from "../art/silkArt";
import { netColor } from "../../ui/semanticColors";
import { pcb } from "../palette";

export interface BoardFrame {
  minX: number;
  minY: number;
  widthMm: number;
  heightMm: number;
  pxPerMm: number;
}

export interface SurfaceMaps {
  color: HTMLCanvasElement;
  orm: HTMLCanvasElement;
  height: HTMLCanvasElement;
}

export interface BakedSurfaces {
  frame: BoardFrame;
  holes: MountingHole[];
  top: SurfaceMaps;
  bottom: SurfaceMaps;
}

export interface BakedLayers {
  copperTop: HTMLCanvasElement;
  copperIn1: HTMLCanvasElement | undefined;
  copperIn2: HTMLCanvasElement | undefined;
  copperBottom: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  silk: HTMLCanvasElement;
  core: HTMLCanvasElement;
}

/** ~32 px/mm keeps 0.25 mm traces 8 px wide; capped so textures stay small. */
const TARGET_PX_PER_MM = 32;
const MAX_PX = 2048;
/** Mask opening grows past the pad by this much (typical fab expansion). */
const MASK_EXPANSION = 0.05;
/** Silk is kept this far off any mask opening. */
const SILK_CLEARANCE = 0.12;
const SILK_LINE = 0.15;
const SILK_TEXT = 1.0;
/** ISO 3098 lettering, like a fab's silkscreen font. */
const SILK_FONT = `{px}px ${SILK_FONT_FAMILY}`;

export function boardFrame(board: Board): BoardFrame {
  const b = outlineBounds(board.outline);
  const maxDim = Math.max(b.width, b.height, 1);
  return {
    minX: b.minX,
    minY: b.minY,
    widthMm: b.width,
    heightMm: b.height,
    pxPerMm: Math.min(TARGET_PX_PER_MM, MAX_PX / maxDim),
  };
}

// ─── canvas plumbing ─────────────────────────────────────────────────────────

type Ctx = CanvasRenderingContext2D;

function makeCanvas(frame: BoardFrame): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(frame.widthMm * frame.pxPerMm));
  c.height = Math.max(1, Math.round(frame.heightMm * frame.pxPerMm));
  return c;
}

/** A 2D context whose user space is board millimetres. */
function mmContext(canvas: HTMLCanvasElement, frame: BoardFrame): Ctx {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable, so the board artwork cannot be drawn.");
  ctx.setTransform(frame.pxPerMm, 0, 0, frame.pxPerMm, -frame.minX * frame.pxPerMm, -frame.minY * frame.pxPerMm);
  return ctx;
}

function fillAll(ctx: Ctx, frame: BoardFrame, style: string): void {
  ctx.fillStyle = style;
  ctx.fillRect(frame.minX, frame.minY, frame.widthMm, frame.heightMm);
}

/** Path for a pad's copper, grown by `grow` mm on every side. */
function padPath(ctx: Ctx, pad: Pad, grow: number, square: boolean): void {
  const w = pad.sizeMm.w + 2 * grow;
  const h = pad.sizeMm.h + 2 * grow;
  const x = pad.position.x - w / 2;
  const y = pad.position.y - h / 2;
  ctx.beginPath();
  if (isThroughHole(pad) && !square) {
    if (Math.abs(w - h) < 1e-6) ctx.arc(pad.position.x, pad.position.y, w / 2, 0, Math.PI * 2);
    else ctx.roundRect(x, y, w, h, Math.min(w, h) / 2);
  } else {
    // KiCad's default round-rect ratio for SMD lands is 25 % of the short side.
    ctx.roundRect(x, y, w, h, square ? 0 : Math.min(w, h) * 0.25);
  }
}

interface Land {
  pad: Pad;
  square: boolean;
}

/** Every copper land on the board, flagged square for pin-1 of through-hole parts. */
function allLands(board: Board): Land[] {
  const lands: Land[] = [];
  for (const part of board.parts) {
    const pattern = landPattern(part);
    const first = pattern.find((p) => p.number === "1" || p.number === "+") ?? null;
    for (const pad of pattern) {
      lands.push({ pad, square: isThroughHole(pad) && pad === first && pattern.length > 1 });
    }
  }
  return lands;
}

function drawTracks(
  ctx: Ctx,
  board: Board,
  layer: CopperLayer,
  style: string | ((netId: string) => string),
  grow = 0,
): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const t of board.tracks) {
    if (t.layer !== layer) continue;
    ctx.strokeStyle = typeof style === "function" ? style(t.netId) : style;
    ctx.lineWidth = t.widthMm + 2 * grow;
    ctx.beginPath();
    ctx.moveTo(t.start.x, t.start.y);
    ctx.lineTo(t.end.x, t.end.y);
    ctx.stroke();
  }
}

function drawZones(ctx: Ctx, board: Board, layer: CopperLayer, style: string | ((netId: string) => string)): void {
  for (const zone of board.zones ?? []) {
    if (zone.layer !== layer || zone.points.length < 3) continue;
    ctx.fillStyle = typeof style === "function" ? style(zone.netId) : style;
    ctx.beginPath();
    ctx.moveTo(zone.points[0]!.x, zone.points[0]!.y);
    for (const point of zone.points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
    ctx.fill();
  }
}

function circle(ctx: Ctx, at: Vec2, r: number, style: string): void {
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Faint glass-weave texture that reads through the semi-gloss mask. */
function weave(ctx: Ctx, frame: BoardFrame, style: string, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = style;
  ctx.lineWidth = 0.08;
  const pitch = 0.42;
  ctx.beginPath();
  for (let x = frame.minX; x <= frame.minX + frame.widthMm; x += pitch) {
    ctx.moveTo(x, frame.minY);
    ctx.lineTo(x, frame.minY + frame.heightMm);
  }
  for (let y = frame.minY; y <= frame.minY + frame.heightMm; y += pitch) {
    ctx.moveTo(frame.minX, y);
    ctx.lineTo(frame.minX + frame.widthMm, y);
  }
  ctx.stroke();
  ctx.restore();
}

// ─── silkscreen ──────────────────────────────────────────────────────────────

/** Run `draw` in a part's package frame (board orientation, mm). */
function inPartFrame(ctx: Ctx, part: Part, draw: () => void): void {
  ctx.save();
  ctx.translate(part.position.x, part.position.y);
  ctx.rotate((-part.rotationDeg * Math.PI) / 180);
  draw();
  ctx.restore();
}

/** Axis-aligned board-space box around everything a part's silk covers. */
interface Box { minX: number; minY: number; maxX: number; maxY: number }

function grow(box: Box, p: Vec2, r = 0): void {
  box.minX = Math.min(box.minX, p.x - r); box.minY = Math.min(box.minY, p.y - r);
  box.maxX = Math.max(box.maxX, p.x + r); box.maxY = Math.max(box.maxY, p.y + r);
}

function strokeRectLocal(ctx: Ctx, part: Part, box: Box, w: number, h: number): void {
  inPartFrame(ctx, part, () => ctx.strokeRect(-w / 2, -h / 2, w, h));
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) grow(box, toBoard(part, { x: (sx * w) / 2, y: (sy * h) / 2 }));
}

/** Draws one part's silk outline and returns the board-space box it covers. */
function drawPartSilk(ctx: Ctx, part: Part): Box {
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const family = packageFamily(part);
  const pads = part.pads;
  for (const pad of landPattern(part)) grow(box, pad.position, Math.max(pad.sizeMm.w, pad.sizeMm.h) / 2);

  const twoTerminal = family === "chip-resistor" || family === "chip-capacitor" || family === "chip-fuse" || family === "chip-led";
  if (twoTerminal && pads.length === 2) {
    const [a, b] = pads as [Pad, Pad];
    const len = Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y);
    const ux = (b.position.x - a.position.x) / len, uy = (b.position.y - a.position.y) / len;
    const nx = -uy, ny = ux;
    const across = Math.max(chipSize(part).width, Math.min(a.sizeMm.w, a.sizeMm.h)) / 2 + 0.25;
    const cx = (a.position.x + b.position.x) / 2, cy = (a.position.y + b.position.y) / 2;
    const half = len / 2 + Math.max(a.sizeMm.w, a.sizeMm.h) / 2 + 0.25;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx - ux * half + nx * across * s, cy - uy * half + ny * across * s);
      ctx.lineTo(cx + ux * half + nx * across * s, cy + uy * half + ny * across * s);
      ctx.stroke();
      grow(box, { x: cx + nx * across * s, y: cy + ny * across * s });
    }
    // LED: close the bracket on the cathode end, as KiCad's LED footprints do.
    if (part.model?.type === "led" || part.model?.type === "diode") {
      const k = part.model.cathodePad === b.number ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(cx + ux * half * k + nx * across, cy + uy * half * k + ny * across);
      ctx.lineTo(cx + ux * half * k - nx * across, cy + uy * half * k - ny * across);
      ctx.stroke();
    }
    return box;
  }

  switch (family) {
    case "sot23": {
      const xs = pads.map((p) => Math.abs(p.position.x - part.position.x));
      const ys = pads.map((p) => Math.abs(p.position.y - part.position.y));
      const leadsOnX = Math.max(...xs) > Math.max(...ys);
      strokeRectLocal(ctx, part, box, leadsOnX ? 1.5 : 3.1, leadsOnX ? 3.1 : 1.5);
      break;
    }
    case "qfp": {
      const g = qfpGeometry(part);
      const c = g.body / 2 + 0.11;
      const arm = c - ((g.pinsPerSide - 1) * g.pitch) / 2 - g.land.short / 2 - SILK_CLEARANCE - SILK_LINE;
      inPartFrame(ctx, part, () => {
        ctx.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
          ctx.moveTo(sx * c, sy * (c - arm));
          ctx.lineTo(sx * c, sy * c);
          ctx.lineTo(sx * (c - arm), sy * c);
        }
        ctx.stroke();
        // Pin-1 marker just outside the first land.
        ctx.beginPath();
        ctx.arc(-g.landCenter - g.land.long / 2 - 0.45, -((g.pinsPerSide - 1) * g.pitch) / 2, 0.22, 0, Math.PI * 2);
        ctx.fill();
      });
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) grow(box, toBoard(part, { x: sx * c, y: sy * c }));
      break;
    }
    case "radial-cap": {
      const diameter = Number(/_D(\d+(?:\.\d+)?)mm/.exec(part.footprint)?.[1] ?? part.body.w);
      const r = diameter / 2 + 0.12;
      ctx.beginPath();
      ctx.arc(part.position.x, part.position.y, r, 0, Math.PI * 2);
      ctx.stroke();
      grow(box, part.position, r);
      const plus = pads.find((p) => p.number === "1") ?? pads[0];
      if (plus) {
        const d = Math.hypot(plus.position.x - part.position.x, plus.position.y - part.position.y) || 1;
        const ux = (plus.position.x - part.position.x) / d, uy = (plus.position.y - part.position.y) / d;
        // "+" sits beside the positive pin, inside the outline, off the pad.
        const at = { x: part.position.x + ux * (r - 1.2) - uy * 2.1, y: part.position.y + uy * (r - 1.2) + ux * 2.1 };
        plusSign(ctx, at, 0.9);
      }
      break;
    }
    case "xt30": {
      const w = part.body.w, h = part.body.h, k = 1.2;
      inPartFrame(ctx, part, () => {
        ctx.beginPath();
        // Bevelled end marks the negative contact, matching the housing key.
        ctx.moveTo(-w / 2, -h / 2);
        ctx.lineTo(w / 2, -h / 2);
        ctx.lineTo(w / 2, h / 2 - k);
        ctx.lineTo(w / 2 - k, h / 2);
        ctx.lineTo(-w / 2 + k, h / 2);
        ctx.lineTo(-w / 2, h / 2 - k);
        ctx.closePath();
        ctx.stroke();
      });
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) grow(box, toBoard(part, { x: (sx * w) / 2, y: (sy * h) / 2 }));
      break;
    }
    case "pin-header": {
      const span = pads.length > 1
        ? Math.hypot(pads[pads.length - 1]!.position.x - pads[0]!.position.x, pads[pads.length - 1]!.position.y - pads[0]!.position.y)
        : 0;
      const vertical = pads.length > 1 && Math.abs(pads[1]!.position.y - pads[0]!.position.y) > Math.abs(pads[1]!.position.x - pads[0]!.position.x);
      const long = span + 2.54 + 0.22, short = 2.54 + 0.22;
      strokeRectLocal(ctx, part, box, vertical ? short : long, vertical ? long : short);
      break;
    }
    default:
      strokeRectLocal(ctx, part, box, part.body.w + 0.3, part.body.h + 0.3);
  }

  // Polarity labels beside "+"/"-" pads (power inputs and batteries).
  const outlineLeft = box.minX;
  for (const pad of pads) {
    if (pad.number !== "+" && pad.number !== "-") continue;
    const at = { x: outlineLeft - 0.8, y: pad.position.y };
    if (pad.number === "+") plusSign(ctx, at, 0.8);
    else minusSign(ctx, at, 0.8);
    grow(box, at, 0.5);
  }
  return box;
}

function plusSign(ctx: Ctx, at: Vec2, size: number): void {
  ctx.beginPath();
  ctx.moveTo(at.x - size / 2, at.y); ctx.lineTo(at.x + size / 2, at.y);
  ctx.moveTo(at.x, at.y - size / 2); ctx.lineTo(at.x, at.y + size / 2);
  ctx.stroke();
}

function minusSign(ctx: Ctx, at: Vec2, size: number): void {
  ctx.beginPath();
  ctx.moveTo(at.x - size / 2, at.y); ctx.lineTo(at.x + size / 2, at.y);
  ctx.stroke();
}

function setFont(ctx: Ctx, heightMm: number): void {
  // Canvas fonts are sized in user units, which here are millimetres.
  ctx.font = SILK_FONT.replace("{px}", String(heightMm * 1.25));
}

/** The full top silkscreen film, already clipped off every mask opening. */
function silkFilm(board: Board, frame: BoardFrame, lands: Land[], holes: MountingHole[]): HTMLCanvasElement {
  const canvas = makeCanvas(frame);
  const ctx = mmContext(canvas, frame);
  ctx.strokeStyle = pcb.silk;
  ctx.fillStyle = pcb.silk;
  ctx.lineWidth = SILK_LINE;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const boxes: Box[] = [];
  for (const part of board.parts) {
    if (part.side !== "top") continue;
    boxes.push(drawPartSilk(ctx, part));
  }

  // Reference designators above each part (below it when that leaves the board).
  setFont(ctx, SILK_TEXT);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  board.parts.forEach((part, i) => {
    const box = boxes[i];
    if (!box || part.side !== "top") return;
    const cx = (box.minX + box.maxX) / 2;
    let y = box.minY - 0.35 - SILK_TEXT / 2;
    if (y - SILK_TEXT / 2 < frame.minY + 0.5) y = box.maxY + 0.35 + SILK_TEXT / 2;
    ctx.fillText(part.ref, cx, y);
  });

  // An imported fabrication layout should not acquire a made-up silkscreen name.
  if (board.simulation !== "reference") {
    setFont(ctx, 1.2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const baseline = frame.minY + frame.heightMm - 1.3;
    const nameX = frame.minX + (holes.some((h) => h.position.x < frame.minX + 6 && h.position.y > frame.minY + frame.heightMm - 6) ? 6 : 1.6);
    ctx.fillText(board.name, nameX, baseline);
  }

  // Silk never prints on a mask opening.
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#000";
  for (const { pad, square } of lands) {
    if (!pad.layers.includes("F.Cu")) continue;
    padPath(ctx, pad, MASK_EXPANSION + SILK_CLEARANCE, square);
    ctx.fill();
  }
  for (const h of holes) circle(ctx, h.position, h.drillMm / 2 + 0.6, "#000");
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}

// ─── finished surfaces ───────────────────────────────────────────────────────

type Pass = "color" | "orm" | "height";

/** Fill styles per pass. ORM packs roughness in G and metalness in B. */
function styles(pass: Pass): Record<"mask" | "maskCopper" | "pad" | "drill" | "laminate", string> {
  const orm = (rough: number, metal: number) => `rgb(0, ${Math.round(rough * 255)}, ${Math.round(metal * 255)})`;
  const gray = (v: number) => `rgb(${v}, ${v}, ${v})`;
  switch (pass) {
    case "color": return { mask: pcb.mask, maskCopper: pcb.maskOverCopper, pad: pcb.enig, drill: pcb.drill, laminate: pcb.laminate };
    case "orm": return { mask: orm(pcb.maskGloss, 0), maskCopper: orm(pcb.maskGloss, 0), pad: orm(0.22, 1), drill: orm(1, 0), laminate: orm(0.75, 0) };
    case "height": return { mask: gray(60), maskCopper: gray(170), pad: gray(135), drill: gray(0), laminate: gray(30) };
  }
}

function paintSurface(
  canvas: HTMLCanvasElement,
  frame: BoardFrame,
  board: Board,
  layer: CopperLayer,
  lands: Land[],
  holes: MountingHole[],
  pass: Pass,
  silk: HTMLCanvasElement | null,
): void {
  const ctx = mmContext(canvas, frame);
  const s = styles(pass);
  fillAll(ctx, frame, s.mask);
  if (pass === "color") weave(ctx, frame, "#000", 0.022);

  // Copper under the mask: traces, land shoulders, via annuli.
  drawZones(ctx, board, layer, s.maskCopper);
  drawTracks(ctx, board, layer, s.maskCopper);
  for (const { pad, square } of lands) {
    if (!pad.layers.includes(layer)) continue;
    padPath(ctx, pad, 0, square);
    ctx.fillStyle = s.maskCopper;
    ctx.fill();
  }
  for (const via of board.vias) circle(ctx, via.position, via.diameterMm / 2, s.maskCopper);

  // Mask openings: ENIG lands, with a soft sheen across the gold.
  for (const { pad, square } of lands) {
    if (!pad.layers.includes(layer)) continue;
    padPath(ctx, pad, 0, square);
    if (pass === "color") {
      const g = ctx.createLinearGradient(
        pad.position.x - pad.sizeMm.w / 2, pad.position.y - pad.sizeMm.h / 2,
        pad.position.x + pad.sizeMm.w / 2, pad.position.y + pad.sizeMm.h / 2,
      );
      g.addColorStop(0, pcb.enig);
      g.addColorStop(1, pcb.enigShadow);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = s.pad;
    }
    ctx.fill();
    if (isThroughHole(pad)) circle(ctx, pad.position, drillFor(pad) / 2, s.drill);
  }

  // Tented vias still show their drill as a dimple.
  for (const via of board.vias) circle(ctx, via.position, via.drillMm / 2, s.drill);

  // Mask pulled back around mounting holes shows bare laminate.
  for (const h of holes) {
    circle(ctx, h.position, h.drillMm / 2 + 0.5, s.laminate);
    circle(ctx, h.position, h.drillMm / 2, s.drill);
  }

  if (silk) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (pass === "color") {
      ctx.drawImage(silk, 0, 0);
    } else {
      // Tint the silk film into this pass's value.
      const tinted = document.createElement("canvas");
      tinted.width = silk.width; tinted.height = silk.height;
      const t = tinted.getContext("2d");
      if (t) {
        t.drawImage(silk, 0, 0);
        t.globalCompositeOperation = "source-in";
        t.fillStyle = pass === "orm" ? "rgb(0, 210, 0)" : "rgb(215, 215, 215)";
        t.fillRect(0, 0, tinted.width, tinted.height);
        ctx.drawImage(tinted, 0, 0);
      }
    }
    ctx.restore();
  }

  if (pass === "height") {
    // Soften edges so the bump shading reads as a coated surface, not stairs.
    const copy = document.createElement("canvas");
    copy.width = canvas.width; copy.height = canvas.height;
    const c = copy.getContext("2d");
    if (c) {
      c.drawImage(canvas, 0, 0);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.filter = `blur(${Math.max(0.6, frame.pxPerMm * 0.03)}px)`;
      ctx.drawImage(copy, 0, 0);
      ctx.restore();
    }
  }
}

function surfaceMaps(board: Board, frame: BoardFrame, layer: CopperLayer, lands: Land[], holes: MountingHole[], silk: HTMLCanvasElement | null): SurfaceMaps {
  const maps = { color: makeCanvas(frame), orm: makeCanvas(frame), height: makeCanvas(frame) };
  paintSurface(maps.color, frame, board, layer, lands, holes, "color", silk);
  paintSurface(maps.orm, frame, board, layer, lands, holes, "orm", silk);
  paintSurface(maps.height, frame, board, layer, lands, holes, "height", silk);
  return maps;
}

/** The finished top and bottom faces. Returns null outside a browser. */
export function bakeSurfaces(board: Board): BakedSurfaces | null {
  if (typeof document === "undefined") return null;
  const frame = boardFrame(board);
  const holes = mountingHoles(board);
  const lands = allLands(board);
  const silk = silkFilm(board, frame, lands, holes);
  return {
    frame,
    holes,
    top: surfaceMaps(board, frame, "F.Cu", lands, holes, silk),
    bottom: surfaceMaps(board, frame, "B.Cu", lands, holes, null),
  };
}

// ─── exploded layers ─────────────────────────────────────────────────────────

function copperSheet(board: Board, frame: BoardFrame, layer: CopperLayer, lands: Land[]): HTMLCanvasElement {
  const canvas = makeCanvas(frame);
  const ctx = mmContext(canvas, frame);
  drawZones(ctx, board, layer, (netId) => netColor(board, netId));
  drawTracks(ctx, board, layer, (netId) => netColor(board, netId));
  for (const { pad, square } of lands) {
    if (!pad.layers.includes(layer)) continue;
    ctx.fillStyle = pad.netId ? netColor(board, pad.netId) : pcb.bareCopper;
    padPath(ctx, pad, 0, square);
    ctx.fill();
  }
  for (const via of board.vias) circle(ctx, via.position, via.diameterMm / 2, netColor(board, via.netId));
  // Drilled holes go straight through the copper.
  ctx.globalCompositeOperation = "destination-out";
  for (const { pad } of lands) if (pad.layers.includes(layer) && isThroughHole(pad)) circle(ctx, pad.position, drillFor(pad) / 2, "#000");
  for (const via of board.vias) circle(ctx, via.position, via.drillMm / 2, "#000");
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}

/** Layer films for the exploded view. Returns null outside a browser. */
export function bakeLayers(board: Board): BakedLayers | null {
  if (typeof document === "undefined") return null;
  const frame = boardFrame(board);
  const holes = mountingHoles(board);
  const lands = allLands(board);

  const mask = makeCanvas(frame);
  {
    const ctx = mmContext(mask, frame);
    fillAll(ctx, frame, pcb.mask);
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";
    for (const { pad, square } of lands) {
      if (!pad.layers.includes("F.Cu")) continue;
      padPath(ctx, pad, MASK_EXPANSION, square);
      ctx.fill();
    }
    for (const via of board.vias) circle(ctx, via.position, via.drillMm / 2, "#000");
    for (const h of holes) circle(ctx, h.position, h.drillMm / 2 + 0.5, "#000");
  }

  const core = makeCanvas(frame);
  {
    const ctx = mmContext(core, frame);
    fillAll(ctx, frame, pcb.core);
    weave(ctx, frame, pcb.coreWeave, 0.07);
    for (const { pad } of lands) if (isThroughHole(pad)) circle(ctx, pad.position, drillFor(pad) / 2, pcb.drill);
    for (const via of board.vias) circle(ctx, via.position, via.drillMm / 2, pcb.drill);
  }

  return {
    copperTop: copperSheet(board, frame, "F.Cu", lands),
    copperIn1: board.copperLayers.includes("In1.Cu") ? copperSheet(board, frame, "In1.Cu", lands) : undefined,
    copperIn2: board.copperLayers.includes("In2.Cu") ? copperSheet(board, frame, "In2.Cu", lands) : undefined,
    copperBottom: copperSheet(board, frame, "B.Cu", lands),
    mask,
    silk: silkFilm(board, frame, lands, holes),
    core,
  };
}
