import { expect, test } from "@playwright/test";

import { loginAsE2EAdmin } from "./helpers/auth";
import { gotoWithRetry } from "./helpers/navigation";
import { createWorkspaceAndOpenPulse } from "./helpers/workspaces";

const E2E_EMAIL = "e2e-admin-contextsplit@starbeamhq.com";

test("context split: profile/goals/members/integrations ownership is clear", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);

  await loginAsE2EAdmin({ page, request, email: E2E_EMAIL });

  const workspaceName = `E2E Context Split ${Date.now()}`;
  const slug = await createWorkspaceAndOpenPulse({
    page,
    name: workspaceName,
  });

  await page.evaluate((workspaceSlug: string) => {
    window.localStorage.setItem(`sb_ui_mode:${workspaceSlug}`, "advanced");
  }, slug);

  await gotoWithRetry(page, `/w/${slug}/profile`);
  await expect(
    page.getByRole("heading", { name: "Personal profile" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Workspace profile" }),
  ).toBeVisible();
  await expect(page.getByText("What to enter")).toHaveCount(0);

  await page.locator('input[name="jobTitle"]').fill("Growth lead");
  await page
    .locator('textarea[name="about"]')
    .fill("I lead growth and care about activation and retention signals.");
  await page.getByRole("button", { name: "Save personal profile" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/w/${slug}/profile\\?saved=personal$`),
  );

  await gotoWithRetry(page, `/w/${slug}/tracks`);
  await expect(page.getByText("Back to Settings")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Personal goals" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Workspace goals" }),
  ).toBeVisible();

  await gotoWithRetry(page, `/w/${slug}/members`);
  const memberRow = page
    .locator(".sb-card-inset", { hasText: E2E_EMAIL })
    .first();
  await expect(
    memberRow.locator('select[name="primaryDepartmentId"]'),
  ).toBeVisible();
  await expect(
    memberRow.locator('select[name="primaryDepartmentId"]'),
  ).not.toHaveValue("");

  await gotoWithRetry(page, `/w/${slug}/integrations`);
  await expect(
    page.getByRole("heading", { name: "Personal integrations" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "raw connected-tool data is not shared with managers or teammates",
      { exact: false },
    ),
  ).toBeVisible();

  await gotoWithRetry(page, `/w/${slug}/announcements`);
  await expect(
    page.getByText(
      "Only workspace admins/managers can post, edit, pin, or delete announcements.",
      { exact: false },
    ),
  ).toBeVisible();
});
