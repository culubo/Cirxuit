/** Rebuild the Microduck reference HAT from Pollen Robotics' KiCad PCB. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseKiCadPcb } from "../src/import/kicad.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "vendor/microduck-hat/elec_RPI_Robot_HAT.kicad_pcb");
const output = resolve(root, "src/model/microduck-hat-board.json");
const board = parseKiCadPcb(readFileSync(source, "utf8"), "Microduck Robot HAT (reference)");
board.id = "microduck-hat-board";
board.simulation = "reference";

// The KiCad file is the authority for placement and copper. The rendering
// dimensions below describe package height only; they do not alter pads.
for (const part of board.parts) {
  const ref = part.ref;
  const value = part.value.toLowerCase();
  part.fitted = !value.startsWith("dnp") && !/^(fid|h\d|g\d)/i.test(ref);
  if (ref.startsWith("R") || ref === "TH1" || ref.startsWith("FB")) part.kind = "resistor";
  else if (ref.startsWith("C")) part.kind = "capacitor";
  else if (ref.startsWith("D")) part.kind = "diode";
  else if (ref.startsWith("J") || ref.startsWith("TP")) part.kind = "connector";
  else if (ref.startsWith("U")) part.kind = "mcu";
  part.body.height = ref === "J4" ? 3.5
    : ref.startsWith("J") ? 4
    : ref.startsWith("U") ? 1.4
    : ref.startsWith("L") ? 2.5
    : ref.startsWith("C") || ref.startsWith("R") ? 0.7 : 1;
  if (ref === "J4") part.blurb = "40-pin connector to a separate Radxa Zero 3W compute board carrying the Rockchip RK3566. The large Pi Zero-shaped footprint is a mechanical clearance reference, not chips on this HAT.";
}

const groups = [
  ["compute", "RK3566 compute board", "The 40-pin J4 header mates with a separate Radxa Zero 3W. The RK3566 is on that board, not on this HAT.", ["J4"]],
  ["power", "Battery and regulation", "Motor input +BATT feeds the HAT; U9 generates the 5 V rail for the compute board.", ["J13", "J14", "U9", "U10", "L4"]],
  ["motors", "Dynamixel buses", "TTL and RS-485 motor connections leave through J3, J11, J13 and J14.", ["J3", "J11", "J13", "J14", "U8"]],
  ["motion", "Motion sensor", "U12 is the LSM6DSV16X inertial sensor on the HAT.", ["U12"]],
  ["audio", "Audio", "The codec, microphone and amplifier handle Microduck's audio path.", ["U1", "U2", "MK1"]],
];
const colors = ["accent-mcu", "accent-power", "accent-driver", "accent-sensor", "accent-warn"];
board.blocks = groups.map(([id, label, description, partRefs], i) => ({ id, label, description, partRefs, color: colors[i] }));
// This is the actual PCB geometry. Power electronics, the RK3566 and motor
// protocol are not represented by the app's DC-only solver, so no fake models
// or voltage readings are added here.
writeFileSync(output, `${JSON.stringify(board)}\n`);
console.log(`Generated ${output}: ${board.parts.length} footprints, ${board.tracks.length} tracks, ${board.vias.length} vias`);
