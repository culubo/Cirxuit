import { expect, test } from "@playwright/test";

test("workbench opens while the technical lettering font is still loading", async ({ page }) => {
  await page.route("**/osifont-*.woff", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("board-switcher")).toBeVisible({ timeout: 2000 });
});
