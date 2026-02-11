import type { Page } from "@playwright/test";

export async function gotoWithRetry(
  page: Page,
  path: string,
  attempts = 3,
): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      return;
    } catch (error) {
      lastError = error;
      const message = String(error);
      if (!message.includes("net::ERR_ABORTED") || i === attempts - 1) break;
      await page.waitForTimeout(250 * (i + 1));
    }
  }
  throw lastError;
}
