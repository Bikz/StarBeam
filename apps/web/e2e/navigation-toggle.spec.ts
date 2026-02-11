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

async function createWorkspace(args: { page: Page; namePrefix: string }) {
  const workspaceName = `${args.namePrefix} ${Date.now()}`;
  const slug = slugify(workspaceName);

  await args.page.locator('input[name="name"]').fill(workspaceName);
  await args.page.getByRole("button", { name: "Create workspace" }).click();
  await expect(args.page.getByText(workspaceName).first()).toBeVisible();

  await args.page.locator(`a[href="/w/${slug}"]`).first().click();
  await expect(args.page).toHaveURL(new RegExp(`/w/${slug}/pulse$`));
  await expect(args.page.getByRole("heading", { name: "Pulse" })).toBeVisible();

  return { slug };
}

test("desktop: hamburger is hidden (lg+)", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await loginAsE2EAdmin({ page, request });
  await createWorkspace({ page, namePrefix: "E2E Nav Desktop" });

  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeHidden();
});

test("mobile: hamburger opens and closes nav drawer", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsE2EAdmin({ page, request });
  await createWorkspace({ page, namePrefix: "E2E Nav Mobile" });

  const open = page.getByRole("button", { name: "Open navigation" });
  await expect(open).toBeVisible();
  await open.click();

  const close = page.getByRole("button", { name: "Close navigation" });
  await expect(close).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(close).toBeHidden();
});
