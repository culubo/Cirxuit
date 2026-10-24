import { expect, test } from "@playwright/test";
import { CUSTOM_BOARD_ID } from "../src/builder/doc";

test("returning from Build PCB restores the selected board and closes layer sheets", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("board-switcher").selectOption("biped-power-board");
  await expect(page.getByTestId("board-name")).toHaveText("Biped Power (concept)");

  await page.getByTestId("layer-sheets-toggle").click();
  await expect(page.getByTestId("layer-sheets")).toBeVisible();
  await page.getByTestId("mode-build").click();
  await expect(page.getByTestId("board-switcher")).toHaveValue(CUSTOM_BOARD_ID);

  await page.getByTestId("mode-simulate").click();
  await expect(page.getByTestId("board-switcher")).toHaveValue("biped-power-board");
  await expect(page.getByTestId("board-name")).toHaveText("Biped Power (concept)");
  await expect(page.getByTestId("layer-sheets")).toHaveCount(0);
  await page.getByTestId("schematic-toggle").click();
  await expect(page.getByTestId("layer-schematic")).toHaveAttribute("data-visible", "true");

  await page.getByTestId("mode-build").click();
  await page.getByTestId("intro-open").click();
  await page.getByTestId("intro-start-demo-board").click();
  await expect(page.getByTestId("mode-simulate")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("board-switcher")).toHaveValue("demo-board");
});
