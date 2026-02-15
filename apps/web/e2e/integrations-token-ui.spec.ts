import { expect, test } from "@playwright/test";

import { loginAsE2EAdmin } from "./helpers/auth";
import { gotoWithRetry } from "./helpers/navigation";
import { createWorkspaceAndOpenPulse } from "./helpers/workspaces";

const E2E_EMAIL = "e2e-admin@starbeamhq.com";

test("integrations token forms: gated CTA, helper copy, and token links", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);

  await loginAsE2EAdmin({ page, request, email: E2E_EMAIL });
  const workspaceName = `E2E Integrations Token UI ${Date.now()}`;
  const slug = await createWorkspaceAndOpenPulse({ page, name: workspaceName });

  await gotoWithRetry(page, `/w/${slug}/integrations`);

  const githubCard = page.locator("#github");
  const githubButton = githubCard.getByRole("button", {
    name: "Connect GitHub",
  });
  const githubInput = githubCard.locator('input[name="token"]');
  await expect(githubButton).toBeDisabled();
  await expect(
    githubCard.getByRole("link", { name: "Create token" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/settings/personal-access-tokens/new",
  );
  await expect(
    githubCard.getByText("We verify the token before saving it."),
  ).toBeVisible();
  await githubInput.fill("ghp_test_token");
  await expect(githubButton).toBeEnabled();
  await githubInput.fill("   ");
  await expect(githubButton).toBeDisabled();

  const linearCard = page.locator("#linear");
  const linearButton = linearCard.getByRole("button", {
    name: "Connect Linear",
  });
  const linearInput = linearCard.locator('input[name="token"]');
  await expect(linearButton).toBeDisabled();
  await expect(
    linearCard.getByRole("link", { name: "Create API key" }),
  ).toHaveAttribute("href", "https://linear.app/settings/account/security");
  await expect(
    linearCard.getByText(
      "Starbeam reads your assigned issues and recent updates",
    ),
  ).toBeVisible();
  await linearInput.fill("lin_api_test");
  await expect(linearButton).toBeEnabled();
  await linearInput.fill(" ");
  await expect(linearButton).toBeDisabled();

  const notionCard = page.locator("#notion");
  const notionButton = notionCard.getByRole("button", {
    name: "Connect Notion",
  });
  const notionInput = notionCard.locator('input[name="token"]');
  await expect(notionButton).toBeDisabled();
  await expect(
    notionCard.getByRole("link", { name: "Create integration" }),
  ).toHaveAttribute("href", "https://www.notion.so/my-integrations");
  await expect(
    notionCard.getByText(
      "share the pages and databases with your integration",
      {
        exact: false,
      },
    ),
  ).toBeVisible();
  await notionInput.fill("secret_test");
  await expect(notionButton).toBeEnabled();
  await notionInput.fill("\n\t ");
  await expect(notionButton).toBeDisabled();
});

test("integrations GitHub scope: selected without repos shows inline error and stays on page", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);

  await loginAsE2EAdmin({ page, request, email: E2E_EMAIL });
  const workspaceName = `E2E GitHub Scope ${Date.now()}`;
  const slug = await createWorkspaceAndOpenPulse({ page, name: workspaceName });

  const seeded = await request.post("/api/test/github-connection", {
    data: {
      email: E2E_EMAIL,
      workspaceSlug: slug,
      githubLogin: `e2e-github-${Date.now()}`,
      repoSelectionMode: "SELECTED",
      selectedRepoFullNames: ["owner/repo"],
    },
  });
  expect(seeded.ok()).toBeTruthy();
  const seededJson = (await seeded.json()) as {
    connection: { id: string; githubLogin: string };
  };
  const connection = seededJson.connection;

  await gotoWithRetry(page, `/w/${slug}/integrations`);

  const connectionRow = page
    .locator(".sb-card-inset", { hasText: connection.githubLogin })
    .first();
  await expect(connectionRow).toBeVisible();

  await connectionRow.locator('select[name="mode"]').selectOption("SELECTED");
  await connectionRow.locator('textarea[name="repos"]').fill("");
  await connectionRow.getByRole("button", { name: "Save scope" }).click();

  await expect(connectionRow.locator(".sb-alert")).toContainText(
    "Add at least one repo",
  );
  await expect(page).toHaveURL(
    new RegExp(`/w/${slug}/integrations(?:\\?.*)?$`),
  );
  await expect(page.getByText("Something went wrong")).toHaveCount(0);

  const afterResp = await request.get(
    `/api/test/github-connection?id=${encodeURIComponent(connection.id)}`,
  );
  expect(afterResp.ok()).toBeTruthy();
  const afterJson = (await afterResp.json()) as {
    connection: { repoSelectionMode: string; selectedRepoFullNames: string[] };
  };
  const after = afterJson.connection;

  expect(after.repoSelectionMode).toBe("SELECTED");
  expect(after.selectedRepoFullNames).toEqual(["owner/repo"]);
});
