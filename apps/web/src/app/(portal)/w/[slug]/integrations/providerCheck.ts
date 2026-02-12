export type ProviderAuthErrorCode =
  | "unauthorized"
  | "forbidden"
  | "invalid"
  | "unknown";

export type ProviderCheckOk<T> = { ok: true; value: T };
export type ProviderCheckErr = {
  ok: false;
  code: ProviderAuthErrorCode;
  status?: number;
};
export type ProviderCheck<T> = ProviderCheckOk<T> | ProviderCheckErr;

function statusToCode(status?: number): ProviderAuthErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  return "unknown";
}

export async function fetchGitHubViewer(
  token: string,
): Promise<ProviderCheck<{ login: string }>> {
  let resp: Response;
  try {
    resp = await fetch("https://api.github.com/user", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: "unknown" };
  }

  const status = resp.status;
  const text = await resp.text();
  if (!resp.ok) return { ok: false, status, code: statusToCode(status) };

  try {
    const parsed = JSON.parse(text) as { login?: unknown };
    const login = typeof parsed.login === "string" ? parsed.login.trim() : "";
    if (!login) return { ok: false, status, code: "invalid" };
    return { ok: true, value: { login } };
  } catch {
    return { ok: false, status, code: "invalid" };
  }
}

export async function fetchLinearViewer(token: string): Promise<
  ProviderCheck<{
    id: string;
    email?: string;
  }>
> {
  let resp: Response;
  try {
    resp = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "query { viewer { id email } }",
      }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: "unknown" };
  }

  const status = resp.status;
  const text = await resp.text();
  if (!resp.ok) return { ok: false, status, code: statusToCode(status) };

  try {
    const parsed = JSON.parse(text) as {
      data?: { viewer?: { id?: unknown; email?: unknown } };
      errors?: Array<{ message?: unknown }>;
    };

    if (Array.isArray(parsed.errors) && parsed.errors.length) {
      const messages = parsed.errors
        .map((e) => (typeof e?.message === "string" ? e.message : ""))
        .filter(Boolean);
      const authLike = messages.some((m) =>
        /(unauthor|forbidden|auth|token|permission)/i.test(m),
      );
      return { ok: false, status, code: authLike ? "unauthorized" : "unknown" };
    }

    const id =
      typeof parsed.data?.viewer?.id === "string" ? parsed.data.viewer.id : "";
    const email =
      typeof parsed.data?.viewer?.email === "string"
        ? parsed.data.viewer.email
        : undefined;

    if (!id) return { ok: false, status, code: "invalid" };
    return { ok: true, value: { id, email } };
  } catch {
    return { ok: false, status, code: "invalid" };
  }
}

export async function fetchNotionBot(
  token: string,
): Promise<ProviderCheck<{ botId: string; workspaceName?: string }>> {
  let resp: Response;
  try {
    resp = await fetch("https://api.notion.com/v1/users/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
      },
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: "unknown" };
  }

  const status = resp.status;
  const text = await resp.text();
  if (!resp.ok) return { ok: false, status, code: statusToCode(status) };

  try {
    const parsed = JSON.parse(text) as {
      id?: unknown;
      bot?: { workspace_name?: unknown };
    };

    const botId = typeof parsed.id === "string" ? parsed.id : "";
    if (!botId) return { ok: false, status, code: "invalid" };

    const workspaceName =
      typeof parsed.bot?.workspace_name === "string"
        ? parsed.bot.workspace_name
        : undefined;

    return { ok: true, value: { botId, workspaceName } };
  } catch {
    return { ok: false, status, code: "invalid" };
  }
}
