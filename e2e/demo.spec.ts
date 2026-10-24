import { expect, test } from "@playwright/test";

function milliAmps(text: string | null): number {
  const match = text?.match(/^\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(m|[µμ]|n|p)?A\s*$/);
  if (!match) throw new Error(`D1 current is not displayed in amps: ${text ?? "(empty)"}`);
  const prefix = match[2];
  const factor = prefix === "m" ? 1 : prefix === "µ" || prefix === "μ" ? 1e-3 : prefix === "n" ? 1e-6 : prefix === "p" ? 1e-9 : 1e3;
  const value = Number(match[1]) * factor;
  if (!Number.isFinite(value)) throw new Error(`D1 current is not a finite number: ${text}`);
  return value;
}

test("the demo code drives the selected LED circuit", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/");
  await page.getByTestId("part-Q1").click();
  await page.getByTestId("code-editor").fill("digitalWrite(8, HIGH)");
  await page.getByTestId("run-button").click();

  await expect.poll(async () => milliAmps(await page.getByTestId("inspector-current-D1").textContent()))
    .toBeGreaterThanOrEqual(11.59);
  const shownCurrent = milliAmps(await page.getByTestId("inspector-current-D1").textContent());
  expect(shownCurrent).toBeLessThanOrEqual(12.81);
  expect(consoleErrors).toEqual([]);
});
