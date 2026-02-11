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

  await args.page.goto("/login?callbackUrl=/dashboard");
  await args.page.locator('input[name="email"]').fill(email);
  await args.page.getByRole("button", { name: "Log in" }).click();
  const otp = await args.request.post("/api/test/otp", { data: { email } });
  expect(otp.ok()).toBeTruthy();
  const otpJson = (await otp.json()) as { code: string };
  await args.page.locator('input[name="code"]').fill(otpJson.code);
  await args.page.getByRole("button", { name: "Log in" }).click();
  await expect(args.page).toHaveURL(/\/dashboard$/);
}

test("context split: profile/goals/members/integrations ownership is clear", async ({
  page,
  request,
}) => {
  await loginAsE2EAdmin({ page, request });

  const workspaceName = `E2E Context Split ${Date.now()}`;
  const slug = slugify(workspaceName);

  await page.locator('input[name="name"]').fill(workspaceName);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByText(workspaceName).first()).toBeVisible();

  await page.locator(`a[href="/w/${slug}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/w/${slug}/pulse$`));

  await page.evaluate((workspaceSlug: string) => {
    window.localStorage.setItem(`sb_ui_mode:${workspaceSlug}`, "advanced");
  }, slug);

  await page.goto(`/w/${slug}/profile`);
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

  await page.goto(`/w/${slug}/tracks`);
  await expect(page.getByText("Back to Settings")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Personal goals" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Workspace goals" }),
  ).toBeVisible();

  await page
    .locator('textarea[name="body"]')
    .first()
    .fill("Ship the first version of VoiceScout and tighten onboarding.");
  await page
    .locator('input[name="title"]')
    .first()
    .fill("Ship VoiceScout beta");
  await page.locator('input[name="targetWindow"]').fill("Next 2 months");
  await page.getByRole("button", { name: "Add personal goal" }).click();
  await expect(page.getByText("Ship VoiceScout beta")).toBeVisible();

  const marketingName = "Marketing";
  await page
    .locator('input[name="name"][placeholder="Marketing"]')
    .fill(marketingName);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText(marketingName).first()).toBeVisible();

  const workspaceGoal = "Increase launch awareness";
  await page
    .locator('input[name="title"][placeholder*="Increase Q2 awareness"]')
    .fill(workspaceGoal);
  await page
    .locator(
      'textarea[name="body"][placeholder*="What does success look like"]',
    )
    .fill("Define channels and cadence.");
  await page.getByRole("button", { name: "Create goal" }).click();
  await expect(page.getByText(workspaceGoal)).toBeVisible();

  await page.goto(`/w/${slug}/members`);
  const memberRow = page
    .locator(".sb-card-inset", { hasText: "e2e-admin@starbeamhq.com" })
    .first();
  await memberRow
    .locator('select[name="primaryDepartmentId"]')
    .selectOption({ label: marketingName });
  await memberRow.getByRole("button", { name: "Save track" }).click();
  await expect(memberRow.getByText("Primary track: Marketing")).toBeVisible();

  await page.goto(`/w/${slug}/integrations`);
  await expect(
    page.getByRole("heading", { name: "Personal integrations" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "raw connected-tool data is not shared with managers or teammates",
      { exact: false },
    ),
  ).toBeVisible();

  await page.goto(`/w/${slug}/announcements`);
  await expect(
    page.getByText(
      "Only workspace admins/managers can post, edit, pin, or delete announcements.",
      { exact: false },
    ),
  ).toBeVisible();
});
