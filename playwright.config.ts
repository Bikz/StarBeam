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

export default defineConfig({
  testDir: "apps/web/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Keep this smoke-focused and deterministic.
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
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
      // Avoid beta gate redirects for the E2E user.
      STARB_ADMIN_EMAILS: mergeAdminEmails(
        process.env.STARB_ADMIN_EMAILS,
        "e2e-admin@starbeamhq.com",
      ),
      // Sensible defaults for local runs when env isn't set.
      AUTH_SECRET: process.env.AUTH_SECRET ?? "dev_only_test_secret_change_me",
      AUTH_URL: process.env.AUTH_URL ?? baseURL,
      NEXT_PUBLIC_WEB_ORIGIN: process.env.NEXT_PUBLIC_WEB_ORIGIN ?? baseURL,
      NEXT_PUBLIC_SITE_ORIGIN:
        process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "http://localhost:3001",
    },
  },
});
