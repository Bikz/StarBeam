import { expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

async function requestOtpWithRetry(args: {
  request: APIRequestContext;
  email: string;
  attempts?: number;
}): Promise<{ code: string }> {
  const attempts = args.attempts ?? 3;
  let lastStatus = 0;
  let lastBody = "";

  for (let i = 0; i < attempts; i += 1) {
    const otp = await args.request.post("/api/test/otp", {
      data: { email: args.email },
    });
    if (otp.ok()) {
      return (await otp.json()) as { code: string };
    }
    lastStatus = otp.status();
    lastBody = await otp.text().catch(() => "");
    await new Promise((resolve) => setTimeout(resolve, 250 * (i + 1)));
  }

  throw new Error(
    `Failed to mint OTP for ${args.email} after ${attempts} attempts (status ${lastStatus}): ${lastBody}`,
  );
}

async function resetTestData(args: { request: APIRequestContext }) {
  const response = await args.request.post("/api/test/reset", {
    data: { confirm: "DELETE_ALL_DATA" },
  });
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Failed to reset e2e test data (status ${response.status()}): ${body}`,
    );
  }
}

export async function loginAsE2EAdmin(args: {
  page: Page;
  request: APIRequestContext;
  email: string;
}) {
  await resetTestData({ request: args.request });

  await args.page.goto("/login?callbackUrl=/dashboard");
  await args.page.locator('input[name="email"]').fill(args.email);
  await args.page.getByRole("button", { name: "Log in" }).first().click();

  const otpJson = await requestOtpWithRetry({
    request: args.request,
    email: args.email,
  });
  expect(otpJson.code).toMatch(/^[0-9]{6}$/);

  await args.page.locator('input[name="code"]').fill(otpJson.code);
  await args.page.getByRole("button", { name: "Log in" }).first().click();

  // Dashboard render confirmation is more deterministic than URL-only checks.
  await expect(args.page.locator('input[name="name"]')).toBeVisible();
  await expect(
    args.page.getByRole("button", { name: "Create workspace" }),
  ).toBeVisible();
}
