import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Board, ElectricalModel, Part, Vec2 } from "../src/model/board-model";

const TRACK_TOLERANCE_MM = 0.05;

type PadUse = { ref: string; pad: string };

function padKey(use: PadUse): string {
  return JSON.stringify([use.ref, use.pad]);
}

function padLabel(use: PadUse): string {
  return `${use.ref} pad ${use.pad}`;
}

function countPads(uses: PadUse[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const use of uses) {
    const key = padKey(use);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function modelPadNames(model: ElectricalModel): { field: string; name: string }[] {
  switch (model.type) {
    case "resistor":
    case "capacitor":
      return [];
    case "potentiometer":
      return [
        { field: "endA", name: model.endA },
        { field: "endB", name: model.endB },
        { field: "wiperPad", name: model.wiperPad },
      ];
    case "vsource":
      return [
        { field: "posPad", name: model.posPad },
        { field: "negPad", name: model.negPad },
      ];
    case "led":
    case "diode":
      return [
        { field: "anodePad", name: model.anodePad },
        { field: "cathodePad", name: model.cathodePad },
      ];
    case "npn":
      return [
        { field: "basePad", name: model.basePad },
        { field: "collectorPad", name: model.collectorPad },
        { field: "emitterPad", name: model.emitterPad },
      ];
    case "mcu":
      return [
        { field: "gndPad", name: model.gndPad },
        { field: "vccPad", name: model.vccPad },
        ...model.pins.map((pin) => ({ field: `pins.${pin.name}.pad`, name: pin.pad })),
      ];
    default: {
      const exhaustive: never = model;
      return exhaustive;
    }
  }
}

function modelPadViolations(part: Part): string[] {
  if (!part.model) return [];
  const names = new Set(part.pads.map((pad) => pad.number));
  return modelPadNames(part.model)
    .filter(({ name }) => !names.has(name))
    .map(({ field, name }) => `Part ${part.ref} model.${field} names missing pad ${JSON.stringify(name)}`);
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Return one readable violation per broken board relationship. */
export function validateBoard(board: Board): string[] {
  const violations: string[] = [];
  const netIds = new Set(board.nets.map((net) => net.id));
  const refs = new Set<string>();
  const actualPadsByNet = new Map<string, PadUse[]>();
  const anchorsByNet = new Map<string, Vec2[]>();

  if (!netIds.has(board.groundNetId)) {
    violations.push(`Ground net ${JSON.stringify(board.groundNetId)} does not exist in board.nets`);
  }

  for (const part of board.parts) {
    if (refs.has(part.ref)) violations.push(`Duplicate part ref ${part.ref}`);
    refs.add(part.ref);
    violations.push(...modelPadViolations(part));
    for (const pad of part.pads) {
      if (pad.netId === null) continue;
      if (!netIds.has(pad.netId)) {
        violations.push(`${padLabel({ ref: part.ref, pad: pad.number })} references missing net ${JSON.stringify(pad.netId)}`);
        continue;
      }
      const use = { ref: part.ref, pad: pad.number };
      const actual = actualPadsByNet.get(pad.netId) ?? [];
      actual.push(use);
      actualPadsByNet.set(pad.netId, actual);
      const anchors = anchorsByNet.get(pad.netId) ?? [];
      anchors.push(pad.position);
      anchorsByNet.set(pad.netId, anchors);
    }
  }

  for (const via of board.vias) {
    if (!netIds.has(via.netId)) {
      violations.push(`Via at (${via.position.x}, ${via.position.y}) references missing net ${JSON.stringify(via.netId)}`);
    }
    const anchors = anchorsByNet.get(via.netId) ?? [];
    anchors.push(via.position);
    anchorsByNet.set(via.netId, anchors);
  }

  for (const net of board.nets) {
    const actual = countPads(actualPadsByNet.get(net.id) ?? []);
    const listed = countPads(net.pads);
    for (const use of actualPadsByNet.get(net.id) ?? []) {
      const key = padKey(use);
      const count = actual.get(key) ?? 0;
      const listedCount = listed.get(key) ?? 0;
      if (count > listedCount) {
        violations.push(`Net ${net.id} (${net.name}) omits ${padLabel(use)} from its pad list`);
        actual.set(key, count - 1);
      }
    }
    for (const use of net.pads) {
      const key = padKey(use);
      const count = listed.get(key) ?? 0;
      const actualCount = countPads(actualPadsByNet.get(net.id) ?? []).get(key) ?? 0;
      if (count > actualCount) {
        violations.push(`Net ${net.id} (${net.name}) lists ${padLabel(use)} without a matching pad on that net`);
        listed.set(key, count - 1);
      }
    }
  }

  for (const [index, track] of board.tracks.entries()) {
    const anchors = anchorsByNet.get(track.netId) ?? [];
    for (const [end, position] of [["start", track.start], ["end", track.end]] as const) {
      if (!anchors.some((anchor) => distance(anchor, position) <= TRACK_TOLERANCE_MM + 1e-9)) {
        violations.push(`Track ${index} ${end} at (${position.x}, ${position.y}) on net ${track.netId} is more than 0.05 mm from any same-net pad or via`);
      }
    }
  }

  for (const block of board.blocks) {
    for (const ref of block.partRefs) {
      if (!refs.has(ref)) violations.push(`Function block ${block.id} references missing part ${ref}`);
    }
  }

  return violations;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const boardPath = resolve(process.argv[2] ?? "src/model/demo-board.json");
  try {
    const board = JSON.parse(readFileSync(boardPath, "utf8")) as Board;
    const violations = validateBoard(board);
    if (violations.length) {
      for (const violation of violations) process.stderr.write(`- ${violation}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(`Board valid: ${boardPath}\n`);
    }
  } catch (error) {
    process.stderr.write(`Could not validate ${boardPath}: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
