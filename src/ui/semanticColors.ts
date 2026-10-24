import type { Board } from "../model/board-model";
import { tokens } from "./tokens";

export type NetRole = "power" | "sensor" | "driver" | "signal";

const POWER_NAME = /^(?:GND|GROUND|VCC|VDD|VIN|VBAT|BAT(?:TERY)?\+?|\+?\d+(?:\.\d+)?V\d*)$/i;
const SENSOR_NAME = /^(?:A\d+|ADC\d*|S\d+|IN\d+|SENSE\w*|TEMP\w*|SENSOR\w*)$/i;
const DRIVER_NAME = /(?:LED|MOTOR|SERVO|DRIVE|LOAD|Q\d+_[CE]$)/i;

/** Infer a stable visual role without changing the board data contract. */
export function netRole(board: Board, netId: string): NetRole {
  const net = board.nets.find((candidate) => candidate.id === netId);
  const name = net?.name || netId;
  if (netId === board.groundNetId || POWER_NAME.test(name)) return "power";
  if (SENSOR_NAME.test(name)) return "sensor";
  if (DRIVER_NAME.test(name)) return "driver";

  const refs = new Set(net?.pads.map((pad) => pad.ref) ?? []);
  const blockTokens = board.blocks
    .filter((block) => block.partRefs.some((ref) => refs.has(ref)))
    .map((block) => block.color);
  if (blockTokens.includes("accent-sensor")) return "sensor";
  if (blockTokens.includes("accent-driver")) return "driver";
  if (blockTokens.includes("accent-power")) return "power";
  return "signal";
}

export function netColor(board: Board, netId: string): string {
  return tokens[netRole(board, netId)];
}

export function deviceStateColor(state: string | undefined): string {
  if (state === "on" || state === "active") return tokens.healthy;
  if (state === "saturated") return tokens.driver;
  if (state === "off" || state === "cutoff") return tokens.textFaint;
  return tokens.textDim;
}
