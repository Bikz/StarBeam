import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { loginAsE2EAdmin } from "./helpers/auth";
import { gotoWithRetry } from "./helpers/navigation";
import { createWorkspaceAndOpenPulse } from "./helpers/workspaces";

const E2E_EMAIL = "e2e-admin-announcements@starbeamhq.com";

function inlineAlert(page: Page, text: string) {
  return page.locator(".sb-alert", { hasText: text }).first();
}

test("announcements: create, edit, delete via side card", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);

  await loginAsE2EAdmin({ page, request, email: E2E_EMAIL });

  const workspaceName = `E2E Announcements ${Date.now()}`;
  const slug = await createWorkspaceAndOpenPulse({
    page,
    name: workspaceName,
  });

  // Enable advanced mode so Announcements is present in the sidebar in real usage.
  await page.evaluate((wsSlug: string) => {
    window.localStorage.setItem(`sb_ui_mode:${wsSlug}`, "advanced");
  }, slug);

  await page.reload();
  const announcementsNav = page.getByRole("link", {
    name: "Announcements",
    exact: true,
  });
  await expect(announcementsNav).toBeVisible();
  await gotoWithRetry(page, `/w/${slug}/announcements`);
  await expect(page).toHaveURL(
    new RegExp(`/w/${slug}/announcements(?:\\?.*)?$`),
  );
  await expect(page.getByText("Back to Settings")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Post an announcement" }),
  ).toHaveCount(0);

  await page.getByRole("link", { name: "Add announcement" }).click();
  await expect(
    page.getByRole("heading", { name: "Post an announcement" }),
  ).toBeVisible();

  const title1 = `Pinned: ship onboarding improvements ${Date.now()}`;
  const body1 = "Two lines of context.";
  await page.locator('input[name="title"]').fill(title1);
  await page.locator('textarea[name="body"]').fill(body1);
  await page.getByRole("button", { name: "Post announcement" }).click();
  await expect(inlineAlert(page, "Announcement posted.")).toBeVisible({
    timeout: 30_000,
  });
  const createdCard = page
    .locator(".sb-card-inset", { hasText: title1 })
    .first();
  await expect(createdCard).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "Post an announcement" }),
  ).toHaveCount(0);

  await createdCard.getByRole("link", { name: "Edit" }).click();

  await expect(
    page.getByRole("heading", { name: "Edit announcement" }),
  ).toBeVisible();

  const title2 = `Pinned: ship onboarding improvements (edited) ${Date.now()}`;
  await page.locator('input[name="title"]').fill(title2);
  await page.locator('textarea[name="body"]').fill("Updated body.");
  await expect(page.locator('input[name="title"]')).toHaveValue(title2);
  await expect(page.locator('textarea[name="body"]')).toHaveValue(
    "Updated body.",
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(inlineAlert(page, "Announcement updated.")).toBeVisible({
    timeout: 30_000,
  });
  const editedCard = page
    .locator(".sb-card-inset", { hasText: title2 })
    .first();
  await expect(editedCard).toBeVisible({ timeout: 30_000 });

  await editedCard.getByRole("link", { name: "Edit" }).click();
  await expect(
    page.getByRole("heading", { name: "Edit announcement" }),
  ).toBeVisible();
  await page.locator('input[name="confirm"]').check();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(inlineAlert(page, "Announcement deleted.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(".sb-card-inset", { hasText: title2 })).toHaveCount(
    0,
  );

  await gotoWithRetry(
    page,
    `/w/${slug}/announcements?edit=ann_missing_for_e2e`,
  );
  await expect(page).toHaveURL(
    new RegExp(`/w/${slug}/announcements\\?error=edit_not_found$`),
  );
  await expect(
    inlineAlert(page, "That announcement no longer exists."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Edit announcement" }),
  ).toHaveCount(0);
});
