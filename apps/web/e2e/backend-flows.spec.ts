import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

import { prisma } from "@starbeam/db";

import { loginAsE2EAdmin } from "./helpers/auth";
import { createWorkspaceAndOpenPulse } from "./helpers/workspaces";

import { mintSignedState } from "../src/lib/signedState";

import { workspace_bootstrap } from "../../worker/src/tasks/workspaceBootstrap";
import { nightly_workspace_run } from "../../worker/src/tasks/nightlyWorkspaceRun";

const E2E_EMAIL = "e2e-admin@starbeamhq.com";

async function startDeviceSignIn(request: APIRequestContext) {
  const resp = await request.post("/api/v1/device/start");
  expect(resp.ok()).toBeTruthy();
  return (await resp.json()) as { deviceCode: string; verificationUrl: string };
}

test("device auth flow: start -> approve -> exchange -> macOS overview", async ({
  page,
  request,
}) => {
  await loginAsE2EAdmin({ page, request, email: E2E_EMAIL });

  const { deviceCode, verificationUrl } = await startDeviceSignIn(request);

  await page.goto(verificationUrl);
  await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page).toHaveURL(/\/device\?.*approved=1/);
  await expect(page.getByText("Approved")).toBeVisible();

  const exchanged = await request.post("/api/v1/device/exchange", {
    data: { deviceCode },
  });
  expect(exchanged.ok()).toBeTruthy();
  const exchangeJson = (await exchanged.json()) as {
    accessToken: string;
    refreshToken: string;
    workspaces: Array<{ id: string }>;
  };
  expect(exchangeJson.accessToken).toMatch(/^[A-Za-z0-9._-]+$/);
  expect(exchangeJson.refreshToken).toMatch(/^[A-Za-z0-9._-]+$/);
  expect(exchangeJson.workspaces.length).toBeGreaterThan(0);

  const workspaceId = exchangeJson.workspaces[0]?.id ?? "";
  expect(workspaceId).toBeTruthy();

  const overview = await request.get(
    `/api/v1/macos/overview?workspace_id=${encodeURIComponent(workspaceId)}`,
    {
      headers: { Authorization: `Bearer ${exchangeJson.accessToken}` },
    },
  );
  expect(overview.ok()).toBeTruthy();
});

test("device exchange + refresh rotation are atomic under concurrency", async ({
  page,
  request,
}) => {
  await loginAsE2EAdmin({ page, request, email: E2E_EMAIL });

  const { deviceCode, verificationUrl } = await startDeviceSignIn(request);

  await page.goto(verificationUrl);
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page).toHaveURL(/approved=1/);

  const [a, b] = await Promise.all([
    request.post("/api/v1/device/exchange", { data: { deviceCode } }),
    request.post("/api/v1/device/exchange", { data: { deviceCode } }),
  ]);

  const ok = [a, b].filter((r) => r.ok());
  const bad = [a, b].filter((r) => !r.ok());

  expect(ok).toHaveLength(1);
  expect(bad).toHaveLength(1);

  const okResp = ok[0];
  const badResp = bad[0];
  if (!okResp || !badResp)
    throw new Error("Expected one exchange success and one failure");

  const okJson = (await okResp.json()) as { refreshToken: string };
  const badJson = (await badResp.json()) as { error: string };
  expect(badJson.error).toBe("invalid_grant");

  const refreshToken = okJson.refreshToken;
  expect(refreshToken).toBeTruthy();

  const [r1, r2] = await Promise.all([
    request.post("/api/v1/device/refresh", { data: { refreshToken } }),
    request.post("/api/v1/device/refresh", { data: { refreshToken } }),
  ]);

  const refreshOk = [r1, r2].filter((r) => r.ok());
  const refreshBad = [r1, r2].filter((r) => !r.ok());

  expect(refreshOk).toHaveLength(1);
  expect(refreshBad).toHaveLength(1);
  const refreshBadResp = refreshBad[0];
  if (!refreshBadResp) throw new Error("Expected one refresh failure");

  expect(refreshBadResp.status()).toBe(401);
  const refreshBadJson = (await refreshBadResp.json()) as { error: string };
  expect(refreshBadJson.error).toBe("invalid_token");
});

test("OTP code consumption is single-use under concurrency", async ({
  browser,
  request,
}) => {
  const reset = await request.post("/api/test/reset", {
    data: { confirm: "DELETE_ALL_DATA" },
  });
  expect(reset.ok()).toBeTruthy();

  const otp = await request.post("/api/test/otp", {
    data: { email: E2E_EMAIL },
  });
  expect(otp.ok()).toBeTruthy();
  const otpJson = (await otp.json()) as { code: string };
  expect(otpJson.code).toMatch(/^[0-9]{6}$/);

  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  try {
    await Promise.all([
      page1.goto("/login?callbackUrl=/dashboard"),
      page2.goto("/login?callbackUrl=/dashboard"),
    ]);

    await Promise.all([
      page1.locator('input[name="email"]').fill(E2E_EMAIL),
      page2.locator('input[name="email"]').fill(E2E_EMAIL),
    ]);

    await Promise.all([
      page1.getByRole("button", { name: "Log in" }).first().click(),
      page2.getByRole("button", { name: "Log in" }).first().click(),
    ]);

    await Promise.all([
      page1.locator('input[name="code"]').fill(otpJson.code),
      page2.locator('input[name="code"]').fill(otpJson.code),
    ]);

    await Promise.all([
      page1.getByRole("button", { name: "Log in" }).first().click(),
      page2.getByRole("button", { name: "Log in" }).first().click(),
    ]);

    // Exactly one should succeed and navigate to dashboard.
    await Promise.any([
      page1.waitForURL(/\/dashboard$/, { timeout: 10_000 }),
      page2.waitForURL(/\/dashboard$/, { timeout: 10_000 }),
    ]);

    const urls = [page1.url(), page2.url()];
    const dashboardCount = urls.filter(
      (u) => new URL(u).pathname === "/dashboard",
    ).length;
    expect(dashboardCount).toBe(1);

    const errorPage =
      new URL(page1.url()).pathname === "/dashboard" ? page2 : page1;
    await expect(errorPage.locator(".sb-alert")).toContainText(
      "Invalid code. Try again.",
    );
  } finally {
    await Promise.all([ctx1.close(), ctx2.close()]);
  }
});

test("Google callback rejects revoked membership before token exchange", async ({
  page,
  request,
}) => {
  await loginAsE2EAdmin({ page, request, email: E2E_EMAIL });

  const workspaceName = `E2E Google Membership ${Date.now()}`;
  const slug = await createWorkspaceAndOpenPulse({ page, name: workspaceName });

  const [user, workspace] = await Promise.all([
    prisma.user.findUnique({
      where: { email: E2E_EMAIL },
      select: { id: true },
    }),
    prisma.workspace.findUnique({ where: { slug }, select: { id: true } }),
  ]);

  const userId = user?.id ?? "";
  const workspaceId = workspace?.id ?? "";
  if (!userId) throw new Error("E2E user not found");
  if (!workspaceId) throw new Error("E2E workspace not found");

  await prisma.membership.deleteMany({
    where: { userId, workspaceId },
  });

  const state = mintSignedState({
    userId,
    workspaceId,
    workspaceSlug: slug,
    nonce: `e2e-${Date.now()}`,
  });

  const resp = await request.get(
    `/api/google/callback?code=e2e_dummy&state=${encodeURIComponent(state)}`,
    { maxRedirects: 0 },
  );

  expect(resp.status()).toBe(302);
  const location = resp.headers().location ?? "";
  expect(location).toContain("/dashboard?error=not_member");

  const connections = await prisma.googleConnection.count();
  expect(connections).toBe(0);
});

test("run-now enqueue + worker job execution updates jobRun + creates pulse", async ({
  page,
  request,
}) => {
  await loginAsE2EAdmin({ page, request, email: E2E_EMAIL });

  const workspaceName = `E2E Run Now ${Date.now()}`;
  const slug = await createWorkspaceAndOpenPulse({ page, name: workspaceName });

  // Fresh workspace: shows "dreaming" (no editions yet). Trigger web enqueue.
  await expect(
    page.getByRole("button", { name: "Generate now" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate now" }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${slug}/pulse\\?queued=1`));

  const [user, workspace] = await Promise.all([
    prisma.user.findUnique({
      where: { email: E2E_EMAIL },
      select: { id: true },
    }),
    prisma.workspace.findUnique({ where: { slug }, select: { id: true } }),
  ]);
  const userId = user?.id ?? "";
  const workspaceId = workspace?.id ?? "";
  if (!userId) throw new Error("E2E user not found");
  if (!workspaceId) throw new Error("E2E workspace not found");

  const bootstrapJobRunId = `bootstrap:${workspaceId}:${userId}`;
  const autoFirstJobRunId = `auto-first:${workspaceId}:${userId}`;

  await workspace_bootstrap({
    workspaceId,
    jobRunId: bootstrapJobRunId,
  });

  await nightly_workspace_run({
    workspaceId,
    userId,
    jobRunId: autoFirstJobRunId,
  });

  const edition = await prisma.pulseEdition.findFirst({
    where: { workspaceId, userId },
    select: { id: true, status: true },
    orderBy: { editionDate: "desc" },
  });

  expect(edition?.id).toBeTruthy();
  expect(edition?.status).toBe("READY");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Pulse" })).toBeVisible();
});
