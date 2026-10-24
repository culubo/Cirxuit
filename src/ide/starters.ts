/**
 * Starter sketches, one per built-in board, written so a developer can read
 * them top to bottom and know what pressing Run will do.
 */
import { BLINK_SKETCH, CUSTOM_BOARD_ID } from "../builder/doc";

const DEMO_SKETCH = [
  "// LED driver demo.",
  "// D8 drives Q1's base through R1. When Q1 turns on, it pulls the LED",
  "// cathode to ground and D1 lights. RV1 sets the voltage on A0.",
  "",
  'pinMode(8, "OUTPUT");',
  "digitalWrite(8, HIGH);   // try LOW, then press Run again",
  "",
  'const reading = analogRead("A0");',
  'log("A0 reads", reading, "of 1023");',
  "",
].join("\n");

const BIPED_SKETCH = [
  "// Biped power board.",
  "// This board has no microcontroller to program: it is the battery,",
  "// fuse, and four leg servos of a walking robot.",
  "//",
  "// Select a servo (J2 to J5) in the Parts list and press Stall to load",
  "// the battery. Watch VBAT sag in the inspector and the Problems panel.",
  "",
].join("\n");

export function starterSketch(boardId: string | null): string {
  switch (boardId) {
    case "demo-board": return DEMO_SKETCH;
    case "biped-power-board": return BIPED_SKETCH;
    case CUSTOM_BOARD_ID: return BLINK_SKETCH;
    default: return "// Write your sketch here, then press Run.\n";
  }
}
