import { defineConfig, devices } from "@playwright/test";

const baseURL = (
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.NEXT_PUBLIC_WEB_ORIGIN ??
  process.env.AUTH_URL ??
  "http://localhost:3000"
).replace(/\/+$/, "");

function mergeAdminEmails(
  existing: string | undefined,
  required: string,
): string {
  const all = new Set(
    (existing ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  all.add(required.trim().toLowerCase());
  return Array.from(all).join(",");
}

function mergeAdminEmailList(
  existing: string | undefined,
  required: string[],
): string {
  return required.reduce(
    (acc, email) => mergeAdminEmails(acc, email),
    existing ?? "",
  );
}

export default defineConfig({
  testDir: "apps/web/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Keep this smoke-focused and deterministic.
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Avoid `pnpm run ... -- ...` argument edge cases; call Next directly.
    // Force webpack for e2e stability; Turbopack can panic in long-running dev sessions.
    command: "pnpm --filter @starbeam/web exec next dev --webpack -p 3000",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      // Required so E2E can mint OTP codes deterministically.
      STARB_TEST_ENDPOINTS: "1",
      STARB_TEST_RESET_ENABLED: process.env.STARB_TEST_RESET_ENABLED ?? "1",
      // Avoid beta gate redirects for the E2E user.
      STARB_ADMIN_EMAILS: mergeAdminEmailList(process.env.STARB_ADMIN_EMAILS, [
        "e2e-admin@starbeamhq.com",
        "e2e-admin-announcements@starbeamhq.com",
        "e2e-admin-contextsplit@starbeamhq.com",
      ]),
      // Sensible defaults for local runs when env isn't set.
      AUTH_SECRET: process.env.AUTH_SECRET ?? "dev_only_test_secret_change_me",
      AUTH_URL: process.env.AUTH_URL ?? baseURL,
      NEXT_PUBLIC_WEB_ORIGIN: process.env.NEXT_PUBLIC_WEB_ORIGIN ?? baseURL,
      NEXT_PUBLIC_SITE_ORIGIN:
        process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "http://localhost:3001",
      // Keep feature-flagged IA deterministic in e2e.
      STARB_CONTEXT_SPLIT_V1: process.env.STARB_CONTEXT_SPLIT_V1 ?? "1",
      STARB_PULSE_MIN5_V1: process.env.STARB_PULSE_MIN5_V1 ?? "1",
      STARB_ANN_MUT_USER_LIMIT_1M:
        process.env.STARB_ANN_MUT_USER_LIMIT_1M ?? "200",
      STARB_ANN_MUT_WORKSPACE_LIMIT_1M:
        process.env.STARB_ANN_MUT_WORKSPACE_LIMIT_1M ?? "500",
      STARB_SKIP_ANNOUNCEMENT_REFRESH:
        process.env.STARB_SKIP_ANNOUNCEMENT_REFRESH ?? "1",
    },
  },
});
