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

const ROBOT_SKETCH = [
  "// Robot controller r2: power-on self test.",
  "// D2..D9 drive the eight status LEDs (D10..D17) through 330 ohm resistors.",
  "const leds = [2, 3, 4, 5, 6, 7, 8, 9];",
  "for (const pin of leds) pinMode(pin, \"OUTPUT\");",
  "",
  "// Lamp test: every LED on, then off.",
  "for (const pin of leds) digitalWrite(pin, HIGH);",
  "for (const pin of leds) digitalWrite(pin, LOW);",
  "",
  "// Sweep there and back. Light the next LED before turning the last one off,",
  "// so one is always lit. Set Speed to Fast or Normal to watch it.",
  "const sweep = [2, 3, 4, 5, 6, 7, 8, 9, 8, 7, 6, 5, 4, 3];",
  "for (let pass = 0; pass < 2; pass++) {",
  "  for (let i = 0; i < sweep.length; i++) {",
  "    digitalWrite(sweep[(i + 1) % sweep.length], HIGH);",
  "    digitalWrite(sweep[i], LOW);",
  "  }",
  "}",
  "log(\"Self test complete:\", leds.length, \"LEDs OK\");",
  "",
].join("\n");

export function starterSketch(boardId: string | null): string {
  switch (boardId) {
    case "demo-board": return DEMO_SKETCH;
    case "biped-power-board": return BIPED_SKETCH;
    case "robot-controller-board": return ROBOT_SKETCH;
    case CUSTOM_BOARD_ID: return BLINK_SKETCH;
    default: return "// Write your sketch here, then press Run.\n";
  }
}
