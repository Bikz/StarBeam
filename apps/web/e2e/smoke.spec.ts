import { expect, test } from "@playwright/test";

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 48);
}

test("health check", async ({ request }) => {
  const resp = await request.get("/api/health");
  expect(resp.ok()).toBeTruthy();
  await expect(resp.json()).resolves.toMatchObject({ ok: true });
});

test("login (email code) and open dashboard", async ({ page, request }) => {
  const email = "e2e-admin@starbeamhq.com";

  // Mint an OTP code deterministically (test-only endpoint).
  const otp = await request.post("/api/test/otp", { data: { email } });
  expect(otp.ok()).toBeTruthy();
  const otpJson = (await otp.json()) as { code: string };
  expect(otpJson.code).toMatch(/^[0-9]{6}$/);

  await page.goto("/login?callbackUrl=/dashboard");

  await page.locator('input[name="email"]').fill(email);
  await page.getByRole("button", { name: "Log in" }).click();

  await page.locator('input[name="code"]').fill(otpJson.code);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Overview")).toBeVisible();
});

test("create org workspace and open it", async ({ page, request }) => {
  const email = "e2e-admin@starbeamhq.com";

  const otp = await request.post("/api/test/otp", { data: { email } });
  expect(otp.ok()).toBeTruthy();
  const otpJson = (await otp.json()) as { code: string };

  await page.goto("/login?callbackUrl=/dashboard");
  await page.locator('input[name="email"]').fill(email);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.locator('input[name="code"]').fill(otpJson.code);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const workspaceName = `E2E Org ${Date.now()}`;
  const slug = slugify(workspaceName);

  await page.locator('input[name="name"]').fill(workspaceName);
  await page.getByRole("button", { name: "Create workspace" }).click();

  // Server action redirects back to /dashboard; wait for workspace card to appear.
  await expect(page.getByText(workspaceName).first()).toBeVisible();

  await page.locator(`a[href="/w/${slug}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/w/${slug}/pulse$`));
  await expect(page.getByRole("heading", { name: "Pulse" })).toBeVisible();
});
