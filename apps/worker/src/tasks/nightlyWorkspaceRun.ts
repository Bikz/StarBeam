import { prisma } from "@starbeam/db";
import type { Prisma } from "@starbeam/db";
import { z } from "zod";

import { startOfDayUtc } from "../lib/dates";
import { generateFocusTasks, syncGoogleConnection } from "../lib/google/sync";
import { isAuthRevoked as isGitHubAuthRevoked, syncGitHubConnection } from "../lib/integrations/github";
import { isAuthRevoked as isLinearAuthRevoked, syncLinearConnection } from "../lib/integrations/linear";
import { isAuthRevoked as isNotionAuthRevoked, syncNotionConnection } from "../lib/integrations/notion";
import {
  buildDepartmentWebResearchPrompt,
  generateWebInsights,
} from "../lib/webResearch";

const NightlyWorkspaceRunPayloadSchema = z.object({
  workspaceId: z.string().min(1),
  jobRunId: z.string().min(1),
});

function priorityForGoal(priority: string): number {
  if (priority === "HIGH") return 880;
  if (priority === "LOW") return 840;
  return 860;
}

function toJsonCitations(
  citations: Array<{ url: string; title?: string }>,
): Prisma.InputJsonValue {
  return {
    citations: citations
      .map((c) => (c.title ? { url: c.url, title: c.title } : { url: c.url }))
      .slice(0, 6),
  };
}

export async function nightly_workspace_run(payload: unknown) {
  const parsed = NightlyWorkspaceRunPayloadSchema.safeParse(payload);
  if (!parsed.success) throw new Error("Invalid nightly job payload");

  const { workspaceId, jobRunId } = parsed.data;

  const jobRun = await prisma.jobRun.findFirst({
    where: { id: jobRunId, workspaceId, kind: "NIGHTLY_WORKSPACE_RUN" },
  });
  if (!jobRun) return;

  await prisma.jobRun.update({
    where: { id: jobRun.id },
    data: { status: "RUNNING", startedAt: new Date(), errorSummary: null },
  });

  let partial = false;
  let errorSummary: string | null = null;

  try {
    const editionDate = startOfDayUtc(new Date());

    const [workspace, profile, memberships, goals, announcements, departments] =
      await Promise.all([
        prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { id: true, name: true, slug: true },
        }),
        prisma.workspaceProfile.findUnique({
          where: { workspaceId },
          select: { websiteUrl: true, description: true, competitorDomains: true },
        }),
        prisma.membership.findMany({
          where: { workspaceId },
          select: { userId: true },
        }),
        prisma.goal.findMany({
          where: { workspaceId, active: true },
          select: { id: true, title: true, body: true, priority: true, departmentId: true },
          orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
          take: 10,
        }),
        prisma.announcement.findMany({
          where: { workspaceId, pinned: true },
          select: {
            id: true,
            title: true,
            body: true,
            dismissals: { select: { userId: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        prisma.department.findMany({
          where: { workspaceId, enabled: true },
          select: {
            id: true,
            name: true,
            promptTemplate: true,
            memberships: { select: { userId: true } },
          },
          orderBy: { createdAt: "asc" },
        }),
      ]);

    if (!workspace) {
      throw new Error("Workspace not found");
    }

    const memberUserIds = memberships.map((m) => m.userId);

    const [googleConnections, githubConnections, linearConnections, notionConnections] =
      await Promise.all([
        prisma.googleConnection.findMany({
          where: {
            workspaceId,
            ownerUserId: { in: memberUserIds },
            // If a sync failed due to an unrelated transient issue (e.g. missing tables during deploy),
            // allow the next run to retry without forcing the user through OAuth again.
            status: { in: ["CONNECTED", "ERROR"] },
          },
          select: { id: true, ownerUserId: true, googleAccountEmail: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.gitHubConnection.findMany({
          where: {
            workspaceId,
            ownerUserId: { in: memberUserIds },
            status: { in: ["CONNECTED", "ERROR"] },
          },
          select: { id: true, ownerUserId: true, githubLogin: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.linearConnection.findMany({
          where: {
            workspaceId,
            ownerUserId: { in: memberUserIds },
            status: { in: ["CONNECTED", "ERROR"] },
          },
          select: { id: true, ownerUserId: true, linearUserEmail: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.notionConnection.findMany({
          where: {
            workspaceId,
            ownerUserId: { in: memberUserIds },
            status: { in: ["CONNECTED", "ERROR"] },
          },
          select: { id: true, ownerUserId: true, notionWorkspaceName: true },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    const googleConnectionsByUser = new Map<string, Array<{ id: string; email: string }>>();
    for (const c of googleConnections) {
      const list = googleConnectionsByUser.get(c.ownerUserId) ?? [];
      list.push({ id: c.id, email: c.googleAccountEmail });
      googleConnectionsByUser.set(c.ownerUserId, list);
    }

    const githubConnectionsByUser = new Map<string, Array<{ id: string; login: string }>>();
    for (const c of githubConnections) {
      const list = githubConnectionsByUser.get(c.ownerUserId) ?? [];
      list.push({ id: c.id, login: c.githubLogin });
      githubConnectionsByUser.set(c.ownerUserId, list);
    }

    const linearConnectionsByUser = new Map<string, Array<{ id: string; email?: string | null }>>();
    for (const c of linearConnections) {
      const list = linearConnectionsByUser.get(c.ownerUserId) ?? [];
      list.push({ id: c.id, email: c.linearUserEmail });
      linearConnectionsByUser.set(c.ownerUserId, list);
    }

    const notionConnectionsByUser = new Map<string, Array<{ id: string; workspaceName?: string | null }>>();
    for (const c of notionConnections) {
      const list = notionConnectionsByUser.get(c.ownerUserId) ?? [];
      list.push({ id: c.id, workspaceName: c.notionWorkspaceName });
      notionConnectionsByUser.set(c.ownerUserId, list);
    }

    const deptCardsByDeptId = new Map<
      string,
      Array<{
        kind: "WEB_RESEARCH";
        title: string;
        body: string;
        why: string;
        action: string;
        sources: Prisma.InputJsonValue;
        priority: number;
      }>
    >();

    const openaiApiKey = process.env.OPENAI_API_KEY ?? "";
    const openaiModel = process.env.OPENAI_MODEL_DEFAULT ?? "gpt-5";

    if (!openaiApiKey) {
      partial = true;
      errorSummary =
        (errorSummary ? `${errorSummary}\n` : "") +
        "OPENAI_API_KEY missing; web research skipped.";
    } else {
      for (const dept of departments) {
        const deptMemberIds = dept.memberships.map((m) => m.userId);
        if (deptMemberIds.length === 0) continue;

        const deptGoals = goals.filter(
          (g) => g.departmentId === dept.id || !g.departmentId,
        );

        const prompt = buildDepartmentWebResearchPrompt({
          workspaceName: workspace.name,
          websiteUrl: profile?.websiteUrl,
          description: profile?.description,
          competitorDomains: profile?.competitorDomains ?? [],
          departmentName: dept.name,
          departmentPromptTemplate: dept.promptTemplate,
          goals: deptGoals.map((g) => ({
            title: g.title,
            body: g.body ?? "",
            priority: g.priority,
          })),
        });

        try {
          const { cards } = await generateWebInsights({
            openaiApiKey,
            model: openaiModel,
            input: prompt,
          });

          const stored = cards.map((c, idx) => ({
            kind: "WEB_RESEARCH" as const,
            title: c.title,
            body: c.body,
            why: c.why,
            action: c.action,
            sources: toJsonCitations(c.citations),
            priority: 700 - idx,
          }));

          if (stored.length) {
            deptCardsByDeptId.set(dept.id, stored);
          }
        } catch (err) {
          partial = true;
          const msg = err instanceof Error ? err.message : String(err);
          errorSummary =
            (errorSummary ? `${errorSummary}\n` : "") +
            `Web research failed for department ${dept.name}: ${msg}`;
        }
      }
    }

    for (const userId of memberUserIds) {
      const googleConns = googleConnectionsByUser.get(userId) ?? [];
      for (const c of googleConns) {
        try {
          await syncGoogleConnection({
            workspaceId,
            userId,
            connectionId: c.id,
          });
          // Successful sync means the connection is viable again.
          await prisma.googleConnection
            .update({ where: { id: c.id }, data: { status: "CONNECTED" } })
            .catch(() => undefined);
        } catch (err) {
          partial = true;
          const msg = err instanceof Error ? err.message : String(err);
          errorSummary =
            (errorSummary ? `${errorSummary}\n` : "") +
            `Google sync failed for ${c.email}: ${msg}`;
          // Mark the connection as ERROR so the UI can prompt reconnect.
          await prisma.googleConnection
            .update({ where: { id: c.id }, data: { status: "ERROR" } })
            .catch(() => undefined);
        }
      }

      const githubConns = githubConnectionsByUser.get(userId) ?? [];
      for (const c of githubConns) {
        try {
          await syncGitHubConnection({ workspaceId, userId, connectionId: c.id });
        } catch (err) {
          partial = true;
          const msg = err instanceof Error ? err.message : String(err);
          errorSummary =
            (errorSummary ? `${errorSummary}\n` : "") +
            `GitHub sync failed for ${c.login}: ${msg}`;

          const status = isGitHubAuthRevoked(err) ? "REVOKED" : "ERROR";
          await prisma.gitHubConnection
            .update({ where: { id: c.id }, data: { status } })
            .catch(() => undefined);
        }
      }

      const linearConns = linearConnectionsByUser.get(userId) ?? [];
      for (const c of linearConns) {
        try {
          await syncLinearConnection({ workspaceId, userId, connectionId: c.id });
        } catch (err) {
          partial = true;
          const msg = err instanceof Error ? err.message : String(err);
          const label = c.email ? c.email : "viewer";
          errorSummary =
            (errorSummary ? `${errorSummary}\n` : "") +
            `Linear sync failed for ${label}: ${msg}`;

          const status = isLinearAuthRevoked(err) ? "REVOKED" : "ERROR";
          await prisma.linearConnection
            .update({ where: { id: c.id }, data: { status } })
            .catch(() => undefined);
        }
      }

      const notionConns = notionConnectionsByUser.get(userId) ?? [];
      for (const c of notionConns) {
        try {
          await syncNotionConnection({ workspaceId, userId, connectionId: c.id });
        } catch (err) {
          partial = true;
          const msg = err instanceof Error ? err.message : String(err);
          const label = c.workspaceName ? c.workspaceName : "workspace";
          errorSummary =
            (errorSummary ? `${errorSummary}\n` : "") +
            `Notion sync failed for ${label}: ${msg}`;

          const status = isNotionAuthRevoked(err) ? "REVOKED" : "ERROR";
          await prisma.notionConnection
            .update({ where: { id: c.id }, data: { status } })
            .catch(() => undefined);
        }
      }

      if (googleConns.length) {
        try {
          await generateFocusTasks({ workspaceId, userId });
        } catch (err) {
          partial = true;
          const msg = err instanceof Error ? err.message : String(err);
          errorSummary =
            (errorSummary ? `${errorSummary}\n` : "") +
            `Focus task generation failed: ${msg}`;
        }
      }

      const edition = await prisma.pulseEdition.upsert({
        where: {
          workspaceId_userId_editionDate: {
            workspaceId,
            userId,
            editionDate,
          },
        },
        update: { status: "GENERATING" },
        create: {
          workspaceId,
          userId,
          editionDate,
          timezone: "UTC",
          status: "GENERATING",
        },
        select: { id: true },
      });

      await prisma.pulseCard.deleteMany({ where: { editionId: edition.id } });

      type CardKind = "ANNOUNCEMENT" | "GOAL" | "WEB_RESEARCH" | "INTERNAL";

      const cards: Array<{
        editionId: string;
        kind: CardKind;
        departmentId?: string | null;
        title: string;
        body: string;
        why: string;
        action: string;
        sources?: Prisma.InputJsonValue;
        priority: number;
      }> = [];

      for (const a of announcements) {
        const dismissed = a.dismissals.some((d) => d.userId === userId);
        if (dismissed) continue;

        cards.push({
          editionId: edition.id,
          kind: "ANNOUNCEMENT",
          title: a.title,
          body: a.body ?? "",
          why: "Pinned announcement from management.",
          action: "Read and align on this.",
          priority: 1000,
        });
      }

      for (const g of goals) {
        cards.push({
          editionId: edition.id,
          kind: "GOAL",
          departmentId: g.departmentId,
          title: g.title,
          body: g.body ?? "",
          why: "Active goal for this workspace.",
          action: "Use this to prioritize today.",
          priority: priorityForGoal(g.priority),
        });
      }

      for (const dept of departments) {
        const isMember = dept.memberships.some((m) => m.userId === userId);
        if (!isMember) continue;

        const deptCards = deptCardsByDeptId.get(dept.id) ?? [];
        for (const wc of deptCards) {
          cards.push({
            editionId: edition.id,
            kind: wc.kind,
            departmentId: dept.id,
            title: wc.title,
            body: wc.body,
            why: wc.why,
            action: wc.action,
            sources: wc.sources,
            priority: wc.priority,
          });
        }
      }

      if (cards.length) {
        await prisma.pulseCard.createMany({ data: cards });
      }

      await prisma.pulseEdition.update({
        where: { id: edition.id },
        data: { status: "READY" },
      });
    }

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: partial ? "PARTIAL" : "SUCCEEDED",
        finishedAt: new Date(),
        errorSummary,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Job failed";
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: { status: "FAILED", finishedAt: new Date(), errorSummary: message },
    });
    throw err;
  }
}
