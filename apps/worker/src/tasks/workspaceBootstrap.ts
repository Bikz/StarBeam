import { prisma } from "@starbeam/db";
import { z } from "zod";

import { isCodexInstalled } from "../lib/codex/exec";
import { syncGoogleConnection } from "../lib/google/sync";
import {
  isAuthRevoked as isGitHubAuthRevoked,
  syncGitHubConnection,
} from "../lib/integrations/github";
import {
  isAuthRevoked as isLinearAuthRevoked,
  syncLinearConnection,
} from "../lib/integrations/linear";
import {
  isAuthRevoked as isNotionAuthRevoked,
  syncNotionConnection,
} from "../lib/integrations/notion";
import { bootstrapWorkspaceConfigIfNeeded } from "../lib/workspaceBootstrap";

const WorkspaceBootstrapPayloadSchema = z.object({
  workspaceId: z.string().min(1),
  jobRunId: z.string().min(1),
});

function isTruthyEnv(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes((value ?? "").trim().toLowerCase());
}

export async function workspace_bootstrap(payload: unknown) {
  const parsed = WorkspaceBootstrapPayloadSchema.safeParse(payload);
  if (!parsed.success) throw new Error("Invalid workspace bootstrap payload");

  const { workspaceId, jobRunId } = parsed.data;

  const jobRun = await prisma.jobRun.findFirst({
    where: { id: jobRunId, workspaceId, kind: "WORKSPACE_BOOTSTRAP" },
  });
  if (!jobRun) return;

  await prisma.jobRun.update({
    where: { id: jobRun.id },
    data: { status: "RUNNING", startedAt: new Date(), errorSummary: null },
  });

  try {
    const triggeredByUserId =
      typeof jobRun.meta === "object" &&
      jobRun.meta &&
      "triggeredByUserId" in jobRun.meta &&
      typeof (jobRun.meta as { triggeredByUserId?: unknown })
        .triggeredByUserId === "string"
        ? String(
            (jobRun.meta as { triggeredByUserId: string }).triggeredByUserId,
          )
        : null;

    const fallbackUserId = await prisma.membership
      .findFirst({
        where: { workspaceId },
        select: { userId: true },
        orderBy: { createdAt: "asc" },
      })
      .then((m) => m?.userId ?? null);

    const userId = triggeredByUserId ?? fallbackUserId;
    if (!userId)
      throw new Error("No workspace member found to attribute bootstrap");

    const [
      googleConnections,
      githubConnections,
      linearConnections,
      notionConnections,
    ] = await Promise.all([
      prisma.googleConnection.findMany({
        where: {
          workspaceId,
          ownerUserId: userId,
          status: { in: ["CONNECTED", "ERROR"] },
        },
        select: { id: true, googleAccountEmail: true },
      }),
      prisma.gitHubConnection.findMany({
        where: {
          workspaceId,
          ownerUserId: userId,
          status: { in: ["CONNECTED", "ERROR"] },
        },
        select: { id: true, githubLogin: true },
      }),
      prisma.linearConnection.findMany({
        where: {
          workspaceId,
          ownerUserId: userId,
          status: { in: ["CONNECTED", "ERROR"] },
        },
        select: { id: true, linearUserEmail: true },
      }),
      prisma.notionConnection.findMany({
        where: {
          workspaceId,
          ownerUserId: userId,
          status: { in: ["CONNECTED", "ERROR"] },
        },
        select: { id: true, notionWorkspaceName: true },
      }),
    ]);

    const sync: {
      google?: { ok: number; failed: number };
      github?: { ok: number; failed: number };
      linear?: { ok: number; failed: number };
      notion?: { ok: number; failed: number };
    } = {};

    let partialErrorSummary: string | null = null;
    const onPartialError = (msg: string) => {
      partialErrorSummary =
        (partialErrorSummary ? `${partialErrorSummary}\n` : "") + msg;
    };

    if (googleConnections.length) {
      sync.google = { ok: 0, failed: 0 };
      for (const c of googleConnections) {
        try {
          await syncGoogleConnection({
            workspaceId,
            userId,
            connectionId: c.id,
          });
          await prisma.googleConnection
            .update({ where: { id: c.id }, data: { status: "CONNECTED" } })
            .catch(() => undefined);
          sync.google.ok += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          onPartialError(
            `Google sync failed for ${c.googleAccountEmail}: ${msg}`,
          );
          await prisma.googleConnection
            .update({ where: { id: c.id }, data: { status: "ERROR" } })
            .catch(() => undefined);
          sync.google.failed += 1;
        }
      }
    }

    if (githubConnections.length) {
      sync.github = { ok: 0, failed: 0 };
      for (const c of githubConnections) {
        try {
          await syncGitHubConnection({
            workspaceId,
            userId,
            connectionId: c.id,
          });
          sync.github.ok += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          onPartialError(`GitHub sync failed for ${c.githubLogin}: ${msg}`);
          const status = isGitHubAuthRevoked(err) ? "REVOKED" : "ERROR";
          await prisma.gitHubConnection
            .update({ where: { id: c.id }, data: { status } })
            .catch(() => undefined);
          sync.github.failed += 1;
        }
      }
    }

    if (linearConnections.length) {
      sync.linear = { ok: 0, failed: 0 };
      for (const c of linearConnections) {
        try {
          await syncLinearConnection({
            workspaceId,
            userId,
            connectionId: c.id,
          });
          sync.linear.ok += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const label = c.linearUserEmail ? c.linearUserEmail : "viewer";
          onPartialError(`Linear sync failed for ${label}: ${msg}`);
          const status = isLinearAuthRevoked(err) ? "REVOKED" : "ERROR";
          await prisma.linearConnection
            .update({ where: { id: c.id }, data: { status } })
            .catch(() => undefined);
          sync.linear.failed += 1;
        }
      }
    }

    if (notionConnections.length) {
      sync.notion = { ok: 0, failed: 0 };
      for (const c of notionConnections) {
        try {
          await syncNotionConnection({
            workspaceId,
            userId,
            connectionId: c.id,
          });
          sync.notion.ok += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const label = c.notionWorkspaceName
            ? c.notionWorkspaceName
            : "workspace";
          onPartialError(`Notion sync failed for ${label}: ${msg}`);
          const status = isNotionAuthRevoked(err) ? "REVOKED" : "ERROR";
          await prisma.notionConnection
            .update({ where: { id: c.id }, data: { status } })
            .catch(() => undefined);
          sync.notion.failed += 1;
        }
      }
    }

    const openaiApiKey = process.env.OPENAI_API_KEY ?? "";
    const codexExecEnabled = isTruthyEnv(process.env.STARB_CODEX_EXEC_ENABLED);
    const codexModel = process.env.STARB_CODEX_MODEL_DEFAULT ?? "gpt-5.2-codex";
    const codexReasoningEffortRaw = (
      process.env.STARB_CODEX_REASONING_EFFORT ?? "medium"
    )
      .trim()
      .toLowerCase();
    const codexReasoningEffort:
      | "minimal"
      | "low"
      | "medium"
      | "high"
      | "xhigh" =
      codexReasoningEffortRaw === "minimal" ||
      codexReasoningEffortRaw === "low" ||
      codexReasoningEffortRaw === "high" ||
      codexReasoningEffortRaw === "xhigh"
        ? codexReasoningEffortRaw
        : "medium";
    const codexWebSearchEnabled =
      process.env.STARB_CODEX_WEB_SEARCH_ENABLED === undefined
        ? true
        : isTruthyEnv(process.env.STARB_CODEX_WEB_SEARCH_ENABLED);
    const codexAvailable =
      codexExecEnabled && openaiApiKey ? await isCodexInstalled() : false;

    const bootstrap = await bootstrapWorkspaceConfigIfNeeded({
      workspaceId,
      triggeredByUserId: userId,
      codex: {
        available: codexAvailable,
        model: codexModel,
        reasoningEffort: codexReasoningEffort,
        enableWebSearch: codexWebSearchEnabled,
      },
    });

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: partialErrorSummary ? "PARTIAL" : "SUCCEEDED",
        finishedAt: new Date(),
        errorSummary: partialErrorSummary,
        meta: {
          ...(typeof jobRun.meta === "object" && jobRun.meta
            ? (jobRun.meta as object)
            : {}),
          sync,
          bootstrap,
          codex: {
            model: codexModel,
            reasoningEffort: codexReasoningEffort,
            webSearch: codexWebSearchEnabled,
          },
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bootstrap failed";
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: { status: "FAILED", finishedAt: new Date(), errorSummary: message },
    });
    throw err;
  }
}
