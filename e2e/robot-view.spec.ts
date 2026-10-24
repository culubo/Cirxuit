import { expect, test } from "@playwright/test";
import { chooseBoard } from "./helpers";

// Robot view on the biped board: the robot's state follows the solved VBAT rail.
// Two stalled servos pull VBAT below its 6 V limit (brownout); releasing them
// brings the rail back and the robot walks again.

async function toggleStall(page: import("@playwright/test").Page, ref: string): Promise<void> {
  await page.getByTestId(`part-${ref}`).click();
  const toggle = page.getByTestId("stall-toggle");
  await expect(toggle).toBeVisible();
  await toggle.click();
}

test("robot view walks, browns out under two stalled servos, and recovers", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(e.message));

  await page.goto("/");
  // Only the biped board offers the robot.
  await expect(page.getByTestId("robot-view-toggle")).toHaveCount(0);
  await chooseBoard(page, "biped-power-board");

  const toggle = page.getByTestId("robot-view-toggle");
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  const robot = page.getByTestId("robot-state");
  await expect(robot).toHaveAttribute("data-robot-ready", "true", { timeout: 15_000 });
  await expect(robot).toHaveAttribute("data-robot-state", "walking");

  // The stall toggles and warning feed stay usable in robot view.
  await toggleStall(page, "J2");
  await expect(robot).toHaveAttribute("data-robot-state", "limping");
  await expect(page.getByTestId("warning-VBAT")).not.toBeVisible();

  await toggleStall(page, "J3");
  await expect(robot).toHaveAttribute("data-robot-state", "brownout");
  await expect(page.getByTestId("warning-feed")).toBeVisible();
  await expect(page.getByTestId("warning-VBAT")).toBeVisible();

  await toggleStall(page, "J2");
  await toggleStall(page, "J3");
  await expect(robot).toHaveAttribute("data-robot-state", "walking");
  await expect(page.getByTestId("warning-VBAT")).not.toBeVisible();

  expect(consoleErrors).toEqual([]);
});
