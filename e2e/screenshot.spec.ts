import { test } from "@playwright/test";

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
