import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 48);
}

async function loginAsE2EAdmin(args: {
  page: Page;
  request: APIRequestContext;
}) {
  const email = "e2e-admin@starbeamhq.com";

  const otp = await args.request.post("/api/test/otp", { data: { email } });
  expect(otp.ok()).toBeTruthy();
  const otpJson = (await otp.json()) as { code: string };

  await args.page.goto("/login?callbackUrl=/dashboard");
  await args.page.locator('input[name="email"]').fill(email);
  await args.page.getByRole("button", { name: "Log in" }).click();
  await args.page.locator('input[name="code"]').fill(otpJson.code);
  await args.page.getByRole("button", { name: "Log in" }).click();
  await expect(args.page).toHaveURL(/\/dashboard$/);
}

test("announcements: create, edit, delete via side card", async ({
  page,
  request,
}) => {
  await loginAsE2EAdmin({ page, request });

  const workspaceName = `E2E Announcements ${Date.now()}`;
  const slug = slugify(workspaceName);

  await page.locator('input[name="name"]').fill(workspaceName);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByText(workspaceName).first()).toBeVisible();

  await page.locator(`a[href="/w/${slug}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/w/${slug}/pulse$`));

  // Enable advanced mode so Announcements is present in the sidebar in real usage.
  await page.evaluate((wsSlug: string) => {
    window.localStorage.setItem(`sb_ui_mode:${wsSlug}`, "advanced");
  }, slug);

  await page.goto(`/w/${slug}/announcements`);
  await expect(page.getByText("Back to Settings")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Post an announcement" }),
  ).toHaveCount(0);

  await page.getByRole("link", { name: "Add announcement" }).click();
  await expect(
    page.getByRole("heading", { name: "Post an announcement" }),
  ).toBeVisible();

  const title1 = "Pinned: ship onboarding improvements";
  const body1 = "Two lines of context.";

  await page.locator('input[name="title"]').fill(title1);
  await page.locator('textarea[name="body"]').fill(body1);
  await page.getByRole("button", { name: "Post announcement" }).click();

  await expect(page.getByText(title1)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Post an announcement" }),
  ).toHaveCount(0);

  const card = page.locator(".sb-card-inset", { hasText: title1 }).first();
  await card.getByRole("link", { name: "Edit" }).click();

  await expect(
    page.getByRole("heading", { name: "Edit announcement" }),
  ).toBeVisible();

  const title2 = "Pinned: ship onboarding improvements (edited)";
  await page.locator('input[name="title"]').fill(title2);
  await page.locator('textarea[name="body"]').fill("Updated body.");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText(title2)).toBeVisible();

  const editedCard = page
    .locator(".sb-card-inset", { hasText: title2 })
    .first();
  await editedCard.getByRole("link", { name: "Edit" }).click();
  await page.locator('input[name="confirm"]').check();
  await page.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByText(title2)).toHaveCount(0);
});
