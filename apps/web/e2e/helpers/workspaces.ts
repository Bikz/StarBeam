import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { gotoWithRetry } from "./navigation";

function slugFromUrl(url: string): string | null {
  const match = url.match(/\/w\/([^/]+)(?:\/|$)/);
  return match?.[1] ?? null;
}

async function ensurePulsePage(page: Page, slug: string): Promise<void> {
  const currentPath = new URL(page.url()).pathname;
  if (currentPath !== `/w/${slug}/pulse`) {
    await gotoWithRetry(page, `/w/${slug}/pulse`);
  }
  await expect(page).toHaveURL(new RegExp(`/w/${slug}/pulse$`));
}

export async function createWorkspaceAndOpenPulse(args: {
  page: Page;
  name: string;
}): Promise<string> {
  const { page, name } = args;

  await page.locator('input[name="name"]').fill(name);
  await page.getByRole("button", { name: "Create workspace" }).click();

  try {
    await expect(page).toHaveURL(/\/w\/[^/]+\/pulse$/, { timeout: 10_000 });
    const directSlug = slugFromUrl(page.url());
    if (directSlug) {
      await ensurePulsePage(page, directSlug);
      return directSlug;
    }
  } catch {
    // Fall through to dashboard-link flow.
  }

  try {
    const workspaceCard = page
      .locator(".sb-card-inset", { hasText: name })
      .first();
    await expect(workspaceCard).toBeVisible({ timeout: 10_000 });

    const openLink = workspaceCard.getByRole("link", { name: "Open" });
    await expect(openLink).toBeVisible();

    const href = await openLink.getAttribute("href");
    expect(href).toBeTruthy();
    const slug = slugFromUrl(href ?? "");
    if (!slug) {
      throw new Error(
        `Failed to parse workspace slug from href: ${String(href)}`,
      );
    }

    await openLink.click();
    await expect(page).toHaveURL(new RegExp(`/w/${slug}(?:/|$)`));
    await ensurePulsePage(page, slug);
    return slug;
  } catch (error) {
    throw new Error(
      `Failed to create and open workspace "${name}": ${String(error)}`,
    );
  }
}
