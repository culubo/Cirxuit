import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Board, Part } from "../src/model/board-model";

const SERVO_REFS = ["J2", "J3", "J4", "J5"] as const;
const biped = JSON.parse(readFileSync(resolve(process.cwd(), "src/model/biped-power-board.json"), "utf8")) as Board;

function hasNets(part: Part, first: string, second: string): boolean {
  const nets = new Set(part.pads.map((pad) => pad.netId));
  return nets.has(first) && nets.has(second);
}

function servoOhms(ref: string, stalled: boolean): number {
  const model = biped.parts.find((part) => part.ref === ref)?.model;
  if (model && "runOhms" in model && "stallOhms" in model &&
      typeof model.runOhms === "number" && typeof model.stallOhms === "number") {
    return stalled ? model.stallOhms : model.runOhms;
  }
  // The current board JSON still represents servos as 25 Ω resistors. The 3 Ω
  // stall resistance is from the planned servo contract exercised by this test.
  if (model?.type === "resistor") return stalled ? 3 : model.ohms;
  throw new Error(`Missing electrical model for servo ${ref}`);
}

function expectedRailVolts(stalledRefs: ReadonlySet<string>): number {
  const source = biped.parts.find((part) => part.model?.type === "vsource")?.model;
  if (source?.type !== "vsource") throw new Error("Biped board has no battery source");
  const seriesOhms = biped.parts
    .filter((part) => part.model?.type === "resistor" && !hasNets(part, "VBAT", "GND"))
    .reduce((sum, part) => sum + (part.model?.type === "resistor" ? part.model.ohms : 0), 0);
  const fixedLoadConductance = biped.parts
    .filter((part) => !SERVO_REFS.some((ref) => ref === part.ref) &&
      part.model?.type === "resistor" && hasNets(part, "VBAT", "GND"))
    .reduce((sum, part) => sum + (part.model?.type === "resistor" ? 1 / part.model.ohms : 0), 0);
  const servoConductance = SERVO_REFS.reduce((sum, ref) => sum + 1 / servoOhms(ref, stalledRefs.has(ref)), 0);
  return source.volts / (1 + seriesOhms * (fixedLoadConductance + servoConductance));
}

test("biped servo stalls show the VBAT warning exactly when the calculated rail falls below its limit", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  const limit = biped.railLimits?.find((entry) => entry.netId === "VBAT");
  if (!limit) throw new Error("Biped board has no VBAT rail limit");
  const stalledRefs = new Set<string>();
  const warning = page.getByTestId("warning-VBAT");
  const checkWarning = async (): Promise<void> => {
    const volts = expectedRailVolts(stalledRefs);
    if (volts < limit.minVolts) {
      await expect(warning, `VBAT=${volts.toFixed(3)} V is below ${limit.minVolts} V`).toBeVisible();
      await expect(warning).toContainText(limit.message);
    } else {
      await expect(warning, `VBAT=${volts.toFixed(3)} V is above ${limit.minVolts} V`).not.toBeVisible();
    }
  };

  await page.goto("/");
  const switcher = page.getByTestId("board-switcher");
  await expect(switcher).toBeVisible();
  await expect(switcher.locator('option[value="biped-power-board"]')).toHaveCount(1);
  await switcher.selectOption("biped-power-board");
  await expect(switcher).toHaveValue("biped-power-board");
  for (const ref of SERVO_REFS) await expect(page.getByTestId(`part-${ref}`)).toBeVisible();
  await expect(page.getByTestId("warning-feed")).toBeVisible();
  await checkWarning();

  for (const ref of SERVO_REFS) {
    await page.getByTestId(`part-${ref}`).click();
    const toggle = page.getByTestId("stall-toggle");
    await expect(toggle).toBeVisible();
    await toggle.click();
    stalledRefs.add(ref);
    await checkWarning();
  }

  await page.getByTestId("part-J5").click();
  await page.getByTestId("stall-toggle").click();
  stalledRefs.delete("J5");
  await checkWarning();
  expect(consoleErrors).toEqual([]);
});
