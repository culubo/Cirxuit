import { expect, test, type Locator } from "@playwright/test";

function displayedMilliAmps(text: string | null): number {
  const match = text?.match(/^\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(m|[µμ]|n|p)?A\s*$/);
  if (!match) throw new Error(`Expected a current in amps, received ${text ?? "(empty)"}`);
  const prefix = match[2];
  const factor = prefix === "m" ? 1 : prefix === "µ" || prefix === "μ" ? 1e-3 : prefix === "n" ? 1e-6 : prefix === "p" ? 1e-9 : 1e3;
  const milliamps = Number(match[1]) * factor;
  if (!Number.isFinite(milliamps)) throw new Error(`Current is not finite: ${text}`);
  return milliamps;
}

async function enterParameter(field: Locator, value: string): Promise<void> {
  await field.fill(value);
  await field.press("Tab");
}

test("editing part values updates the live circuit and reset restores the demo", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  const warningD1 = page.getByTestId("warning-D1");
  const currentD1 = page.getByTestId("inspector-current-D1");
  const ohms = page.getByTestId("inspector-param-ohms");

  await page.goto("/");
  await page.getByTestId("code-editor").fill("digitalWrite(8, HIGH)");
  await page.getByTestId("run-button").click();
  await expect.poll(async () => displayedMilliAmps(await currentD1.textContent()))
    .toBeGreaterThan(10);

  await test.step("1. R2 at 10 ohms warns that D1 is overcurrent", async () => {
    await page.getByTestId("part-R2").click();
    await expect(ohms).toBeVisible();
    await enterParameter(ohms, "10");
    await expect(page.getByTestId("warning-feed")).toBeVisible();
    await expect(warningD1).toBeVisible();
    await expect(warningD1).toContainText(/overcurrent/i);
  });

  await test.step("2. R2 at 4.7k clears the warning and keeps D1 below 1 mA", async () => {
    await enterParameter(ohms, "4.7k");
    await expect(warningD1).not.toBeVisible();
    await expect.poll(async () => displayedMilliAmps(await currentD1.textContent()))
      .toBeLessThan(1);
  });

  await test.step("3. Invalid R2 values show an inline error and preserve the last valid circuit", async () => {
    const validCurrent = await currentD1.textContent();
    for (const invalid of ["-5", "abc"]) {
      await enterParameter(ohms, invalid);
      await expect(page.getByTestId("inspector-param-error"), `Invalid value ${invalid}`).toBeVisible();
      await expect(currentD1).toHaveText(validCurrent ?? "");
      await expect(warningD1).not.toBeVisible();
    }
  });

  await test.step("4. Q1 with beta 1 is not saturated", async () => {
    // At 4.7 kΩ, the small LED load could still saturate Q1 with beta 1.
    // Restore the 220 Ω collector load to make this a meaningful state check.
    await enterParameter(ohms, "220");
    await expect(page.getByTestId("inspector-param-error")).not.toBeVisible();
    await page.getByTestId("part-Q1").click();
    await enterParameter(page.getByTestId("inspector-param-beta"), "1");
    await page.getByTestId("code-editor").fill("digitalWrite(8, HIGH)");
    await page.getByTestId("run-button").click();
    const selectedSummary = page.getByText("Selected", { exact: true }).locator("..");
    await expect(selectedSummary).toContainText(/\b(active|cutoff)\b/i);
    await expect(selectedSummary).not.toContainText(/\bsaturated\b/i);
  });

  await test.step("5. Reset restores R2 to 220 ohms and clears warnings", async () => {
    await page.getByTestId("reset-board-button").click();
    await page.getByTestId("part-R2").click();
    await expect(ohms).toHaveValue("220");
    await expect(page.getByTestId("warning-feed").locator('[data-testid^="warning-"]')).toHaveCount(0);
  });

  expect(consoleErrors, `Browser console errors: ${consoleErrors.join("; ")}`).toEqual([]);
});
