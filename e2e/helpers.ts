import { expect, type Page } from "@playwright/test";

export async function chooseBoard(page: Page, boardId: string): Promise<void> {
  const picker = page.getByTestId("board-switcher");
  await picker.click();
  await page.getByTestId(`board-option-${boardId}`).click();
  await expect(picker).toHaveAttribute("data-value", boardId);
}
