import { expect, test } from "@playwright/test";

/**
 * Visual-polish verification harness. Not part of acceptance — it captures PNGs
 * under test-results/shots/ for manual/agent review against design.md.
 * Run a single case with:  npx playwright test e2e/screenshot.spec.ts -g "<name>"
 */

const SETTLE_MS = 900;

test("shot: default", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(SETTLE_MS);
  await page.screenshot({ path: "test-results/shots/default.png" });
});

test("shot: d8-high", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("part-Q1").click();
  await page.getByTestId("code-editor").fill("digitalWrite(8, HIGH)");
  await page.getByTestId("run-button").click();
  await page.waitForTimeout(SETTLE_MS);
  await page.screenshot({ path: "test-results/shots/d8-high.png" });
});

test("shot: exploded", async ({ page }) => {
  await page.goto("/");
  const slider = page.getByTestId("explode-slider");
  if (await slider.count()) {
    await slider.fill("1");
  }
  await page.waitForTimeout(SETTLE_MS);
  await page.screenshot({ path: "test-results/shots/exploded.png" });
});

test("shot: selected", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("part-D1").click();
  await page.waitForTimeout(SETTLE_MS);
  await page.screenshot({ path: "test-results/shots/selected.png" });
});

test("shot: biped-stalled", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("board-switcher").selectOption("biped-power-board");
  for (const ref of ["J2", "J3", "J4", "J5"]) {
    await page.getByTestId(`part-${ref}`).click();
    const toggle = page.getByTestId("stall-toggle");
    if (await toggle.count()) await toggle.click();
  }
  await page.waitForTimeout(SETTLE_MS);
  await page.screenshot({ path: "test-results/shots/biped-stalled.png" });
});

// ── IDE workbench ────────────────────────────────────────────────────────────
test.describe("ide", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("shot: ide-default", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(SETTLE_MS * 2);
    await page.screenshot({ path: "test-results/shots/ide-default.png" });
  });

  test("shot: ide-slow-replay", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("speed-select").selectOption("1");
    await page.getByTestId("run-button").click();
    await page.getByTestId("tab-trace").click();
    await page.waitForTimeout(2300);
    await page.screenshot({ path: "test-results/shots/ide-slow-replay.png" });
  });

  test("shot: ide-build-error", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("code-editor").fill('pinMode(8, OUTPUT);\ndigitalwrite(99, HIGH);\ndelay(500);\n');
    await page.waitForTimeout(600);
    await page.getByTestId("run-button").click();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: "test-results/shots/ide-build-error.png" });
  });

  test("shot: builder", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("mode-build").click();
    await page.getByTestId("builder-starter").click();
    await page.getByTestId("palette-npn").click();
    await page.getByTestId("builder-canvas").click({ position: { x: 380, y: 520 } });
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: "test-results/shots/builder.png" });
  });

  test("shot: builder-simulated", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("mode-build").click();
    await page.getByTestId("builder-starter").click();
    await page.getByTestId("builder-simulate").click();
    await page.getByTestId("run-button").click();
    await page.waitForTimeout(SETTLE_MS * 2);
    await page.screenshot({ path: "test-results/shots/builder-simulated.png" });
  });
});


// ── Schematic overlay ───────────────────────────────────────────────────────
// Uses the hand-authored schematic data shipped in each board JSON.
async function openExploded(
  page: import("@playwright/test").Page,
  boardId: string,
  code: string,
  explode = "1",
): Promise<void> {
  await page.goto("/");
  if (boardId !== "demo-board") {
    await page.getByTestId("board-switcher").selectOption(boardId);
  }
  // Keep the guide card from covering the viewport in the shots.
  if (await page.getByTestId("guide-panel").isVisible()) {
    await page.getByTestId("guide-toggle").click();
  }
  await page.getByTestId("code-editor").fill(code);
  await page.getByTestId("run-button").click();
  await page.getByTestId("explode-slider").fill(explode);
  await page.waitForTimeout(1500);
}

test.describe("schematic", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("shot: schematic-exploded", async ({ page }) => {
    await openExploded(page, "demo-board", "digitalWrite(8, HIGH)");
    await page.screenshot({ path: "test-results/shots/schematic-exploded.png" });
  });

  test("shot: schematic-hover-symbol", async ({ page }) => {
    await openExploded(page, "demo-board", "digitalWrite(8, HIGH)");
    await page.getByTestId("schematic-symbol-R2").hover();
    await page.waitForTimeout(500);
    await page.screenshot({ path: "test-results/shots/schematic-hover-symbol.png" });
  });

  test("shot: schematic-select-net", async ({ page }) => {
    await openExploded(page, "demo-board", "digitalWrite(8, HIGH)");
    await page.getByTestId("schematic-wire-LED_A").click();
    await page.mouse.move(5, 5);
    await page.waitForTimeout(500);
    await page.screenshot({ path: "test-results/shots/schematic-select-net.png" });
  });

  test("shot: schematic-fading", async ({ page }) => {
    await openExploded(page, "demo-board", "digitalWrite(8, HIGH)", "0.75");
    await page.screenshot({ path: "test-results/shots/schematic-fading.png" });
  });

  test("shot: schematic-biped", async ({ page }) => {
    await openExploded(page, "biped-power-board", "");
    await page.screenshot({ path: "test-results/shots/schematic-biped.png" });
  });
});

// ── Robot view ──────────────────────────────────────────────────────────────
test.describe("robot", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  async function openRobot(page: import("@playwright/test").Page): Promise<void> {
    await page.goto("/");
    await page.getByTestId("board-switcher").selectOption("biped-power-board");
    if (await page.getByTestId("guide-panel").isVisible()) await page.getByTestId("guide-toggle").click();
    await page.getByTestId("robot-view-toggle").click();
    await expect(page.getByTestId("robot-state")).toHaveAttribute("data-robot-ready", "true", { timeout: 15_000 });
  }
  async function stall(page: import("@playwright/test").Page, ref: string): Promise<void> {
    await page.getByTestId(`part-${ref}`).click();
    await page.getByTestId("stall-toggle").click();
  }

  test("shot: robot-transition", async ({ page }) => {
    await openRobot(page);
    await page.waitForTimeout(650);
    await page.screenshot({ path: "test-results/shots/robot-transition.png" });
  });

  test("shot: robot-walking", async ({ page }) => {
    await openRobot(page);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: "test-results/shots/robot-walking.png" });
  });

  test("shot: robot-limping", async ({ page }) => {
    await openRobot(page);
    await stall(page, "J2");
    await page.waitForTimeout(2200);
    await page.screenshot({ path: "test-results/shots/robot-limping.png" });
  });

  test("shot: robot-brownout", async ({ page }) => {
    await openRobot(page);
    await page.waitForTimeout(1600);
    await stall(page, "J2");
    await stall(page, "J3");
    await expect(page.getByTestId("robot-state")).toHaveAttribute("data-robot-phase", "collapse");
    await page.waitForTimeout(2500);
    await page.screenshot({ path: "test-results/shots/robot-brownout.png" });
  });
});
