import type { ElectricalModel } from "../model/board-model";
import { docToBoard, type BuilderDoc, type PadRef } from "./doc";
import { TEMPLATES, type TemplateKind } from "./templates";

export const PROJECT_FORMAT = "circxit-project";
export const PROJECT_VERSION = 1;
export const MAX_PROJECT_BYTES = 2 * 1024 * 1024;

export interface CircxitProject {
  format: typeof PROJECT_FORMAT;
  version: typeof PROJECT_VERSION;
  design: BuilderDoc;
  board: ReturnType<typeof docToBoard>;
  sketch?: { language: "circxit-js"; code: string };
}

export type ProjectParseResult =
  | { ok: true; project: CircxitProject }
  | { ok: false; error: string };

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const positive = (value: unknown): value is number => finite(value) && value > 0;
const text = (value: unknown): value is string => typeof value === "string";
const padRef = (value: unknown): value is PadRef => record(value) && text(value.ref) && text(value.pad);

function validModel(value: unknown, expected: ElectricalModel["type"]): value is ElectricalModel {
  if (!record(value) || value.type !== expected) return false;
  switch (expected) {
    case "resistor": return positive(value.ohms);
    case "capacitor": return positive(value.farads);
    case "vsource": return finite(value.volts) && text(value.posPad) && text(value.negPad);
    case "led": return positive(value.vf) && positive(value.rOn) && text(value.anodePad) && text(value.cathodePad) && text(value.color);
    case "potentiometer": return positive(value.ohms) && finite(value.wiper) && value.wiper >= 0 && value.wiper <= 1
      && text(value.endA) && text(value.endB) && text(value.wiperPad);
    case "npn": return positive(value.beta) && positive(value.vbe) && positive(value.vceSat)
      && text(value.basePad) && text(value.collectorPad) && text(value.emitterPad);
    case "servo": return positive(value.runOhms) && positive(value.stallOhms) && typeof value.stalled === "boolean"
      && text(value.posPad) && text(value.negPad);
    case "mcu": {
      if (!positive(value.vcc) || !text(value.gndPad) || !text(value.vccPad)
        || !finite(value.adcBits) || !Number.isInteger(value.adcBits) || value.adcBits < 1 || value.adcBits > 24
        || !Array.isArray(value.pins) || value.pins.length > 64) return false;
      return value.pins.every((pin) => record(pin) && text(pin.name) && text(pin.pad) && positive(pin.outputOhms)
        && Array.isArray(pin.capabilities)
        && pin.capabilities.every((cap) => cap === "digital" || cap === "analog_in" || cap === "pwm"));
    }
    case "diode": return positive(value.vf) && positive(value.rOn) && text(value.anodePad) && text(value.cathodePad);
  }
}

function validateDesign(value: unknown): { ok: true; design: BuilderDoc } | { ok: false; error: string } {
  if (!record(value)) return { ok: false, error: "Project design is missing or invalid." };
  if (!text(value.name) || value.name.length > 80) return { ok: false, error: "Design name must be between 1 and 80 characters." };
  if (!finite(value.widthMm) || !finite(value.heightMm) || value.widthMm < 10 || value.widthMm > 200 || value.heightMm < 10 || value.heightMm > 200) {
    return { ok: false, error: "Board dimensions must be between 10 mm and 200 mm." };
  }
  if (!Array.isArray(value.parts) || value.parts.length > 500) return { ok: false, error: "Design parts are invalid or exceed 500 items." };
  if (!Array.isArray(value.wires) || value.wires.length > 2000) return { ok: false, error: "Design wires are invalid or exceed 2,000 items." };

  const refs = new Set<string>();
  for (const [index, candidate] of value.parts.entries()) {
    if (!record(candidate) || !text(candidate.ref) || !/^[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(candidate.ref)) {
      return { ok: false, error: `Part ${index + 1} has an invalid reference.` };
    }
    if (refs.has(candidate.ref)) return { ok: false, error: `Part reference ${candidate.ref} is duplicated.` };
    refs.add(candidate.ref);
    if (!text(candidate.kind) || !Object.hasOwn(TEMPLATES, candidate.kind)) return { ok: false, error: `Part ${candidate.ref} uses an unsupported template.` };
    const kind = candidate.kind as TemplateKind;
    if (!finite(candidate.x) || !finite(candidate.y) || candidate.x < 0 || candidate.x > value.widthMm || candidate.y < 0 || candidate.y > value.heightMm) {
      return { ok: false, error: `Part ${candidate.ref} is outside the board.` };
    }
    if (candidate.rotation !== 0 && candidate.rotation !== 90 && candidate.rotation !== 180 && candidate.rotation !== 270) {
      return { ok: false, error: `Part ${candidate.ref} has an invalid rotation.` };
    }
    if (!validModel(candidate.model, TEMPLATES[kind].defaultModel().type)) {
      return { ok: false, error: `Part ${candidate.ref} has an invalid electrical model.` };
    }
  }

  const design = value as unknown as BuilderDoc;
  const wireIds = new Set<string>();
  const endpointExists = (endpoint: PadRef): boolean => {
    const part = design.parts.find((candidate) => candidate.ref === endpoint.ref);
    return Boolean(part && TEMPLATES[part.kind].pads.some((pad) => pad.number === endpoint.pad));
  };
  for (const [index, candidate] of value.wires.entries()) {
    if (!record(candidate) || !text(candidate.id) || !candidate.id || wireIds.has(candidate.id) || !padRef(candidate.a) || !padRef(candidate.b)) {
      return { ok: false, error: `Wire ${index + 1} is invalid or duplicated.` };
    }
    wireIds.add(candidate.id);
    if (!endpointExists(candidate.a) || !endpointExists(candidate.b)) return { ok: false, error: `Wire ${candidate.id} references a missing pad.` };
    if (candidate.a.ref === candidate.b.ref && candidate.a.pad === candidate.b.pad) return { ok: false, error: `Wire ${candidate.id} connects a pad to itself.` };
  }
  return { ok: true, design };
}

export function createProject(design: BuilderDoc, code: string): CircxitProject {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    design,
    board: docToBoard(design),
    sketch: { language: "circxit-js", code },
  };
}

export function parseProjectJson(source: string): ProjectParseResult {
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch {
    return { ok: false, error: "This file is not valid JSON." };
  }
  if (!record(value) || value.format !== PROJECT_FORMAT) {
    return { ok: false, error: "Choose a Circxit project file (.circxit.json), not a PCB-only JSON file." };
  }
  if (value.version !== PROJECT_VERSION) return { ok: false, error: `Unsupported Circxit project version: ${String(value.version)}.` };
  const parsed = validateDesign(value.design);
  if (!parsed.ok) return parsed;
  if (!record(value.board)) return { ok: false, error: "The generated PCB snapshot is missing." };
  const generated = docToBoard(parsed.design);
  if (JSON.stringify(value.board) !== JSON.stringify(generated)) {
    return { ok: false, error: "The PCB snapshot does not match the editable design." };
  }
  let sketch: CircxitProject["sketch"];
  if (value.sketch !== undefined) {
    if (!record(value.sketch) || value.sketch.language !== "circxit-js" || !text(value.sketch.code) || value.sketch.code.length > 500_000) {
      return { ok: false, error: "The project sketch is invalid or too large." };
    }
    sketch = { language: "circxit-js", code: value.sketch.code };
  }
  return { ok: true, project: { format: PROJECT_FORMAT, version: PROJECT_VERSION, design: parsed.design, board: generated, ...(sketch ? { sketch } : {}) } };
}
