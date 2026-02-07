import type { Prisma } from "@starbeam/db";
import { prisma } from "@starbeam/db";
import { z } from "zod";

import { isCodexInstalled } from "../lib/codex/exec";
import { startOfDayUtc } from "../lib/dates";

import {
  generateLegacyDepartmentWebResearchCards,
  priorityForGoal,
  syncUserConnectorsAndMaybeCodex,
  toJsonCitations,
} from "./nightlyWorkspaceRunHelpers";

const NightlyWorkspaceRunPayloadSchema = z.object({
  workspaceId: z.string().min(1),
  jobRunId: z.string().min(1),
});

function isTruthyEnv(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes((value ?? "").trim().toLowerCase());
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

  const onPartialError = (msg: string) => {
    partial = true;
    errorSummary = (errorSummary ? `${errorSummary}\n` : "") + msg;
  };

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

    if (!workspace) throw new Error("Workspace not found");

    const memberUserIds = memberships.map((m) => m.userId);

    const [googleConnections, githubConnections, linearConnections, notionConnections] =
      await Promise.all([
        prisma.googleConnection.findMany({
          where: {
            workspaceId,
            ownerUserId: { in: memberUserIds },
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

    const linearConnectionsByUser = new Map<
      string,
      Array<{ id: string; email?: string | null }>
    >();
    for (const c of linearConnections) {
      const list = linearConnectionsByUser.get(c.ownerUserId) ?? [];
      list.push({ id: c.id, email: c.linearUserEmail });
      linearConnectionsByUser.set(c.ownerUserId, list);
    }

    const notionConnectionsByUser = new Map<
      string,
      Array<{ id: string; workspaceName?: string | null }>
    >();
    for (const c of notionConnections) {
      const list = notionConnectionsByUser.get(c.ownerUserId) ?? [];
      list.push({ id: c.id, workspaceName: c.notionWorkspaceName });
      notionConnectionsByUser.set(c.ownerUserId, list);
    }

    const openaiApiKey = process.env.OPENAI_API_KEY ?? "";
    const openaiModel = process.env.OPENAI_MODEL_DEFAULT ?? "gpt-5";

    const codexExecEnabled = isTruthyEnv(process.env.STARB_CODEX_EXEC_ENABLED);
    const codexModel = process.env.STARB_CODEX_MODEL_DEFAULT ?? "gpt-5.2-codex";
    const codexWebSearchEnabled =
      process.env.STARB_CODEX_WEB_SEARCH_ENABLED === undefined
        ? true
        : isTruthyEnv(process.env.STARB_CODEX_WEB_SEARCH_ENABLED);
    const codexAvailable =
      codexExecEnabled && openaiApiKey ? await isCodexInstalled() : false;

    if (codexExecEnabled && openaiApiKey && !codexAvailable) {
      onPartialError("codex binary not found; Codex pulse generation skipped.");
    }

    const legacyOverride = (process.env.STARB_LEGACY_DEPT_WEB_RESEARCH_ENABLED ?? "")
      .trim()
      .toLowerCase();
    const legacyDeptWebResearchEnabled = legacyOverride
      ? isTruthyEnv(legacyOverride)
      : !codexAvailable;

    if (!openaiApiKey) {
      onPartialError("OPENAI_API_KEY missing; web research skipped.");
    }

    const deptCardsByDeptId = await generateLegacyDepartmentWebResearchCards({
      enabled: Boolean(openaiApiKey) && legacyDeptWebResearchEnabled,
      openaiApiKey,
      model: openaiModel,
      workspace,
      profile,
      goals,
      departments,
      onPartialError,
    });

    for (const userId of memberUserIds) {
      const codexPulse = await syncUserConnectorsAndMaybeCodex({
        workspaceId,
        workspace,
        profile,
        goals,
        departments,
        userId,
        googleConnections: googleConnectionsByUser.get(userId) ?? [],
        githubConnections: githubConnectionsByUser.get(userId) ?? [],
        linearConnections: linearConnectionsByUser.get(userId) ?? [],
        notionConnections: notionConnectionsByUser.get(userId) ?? [],
          codexAvailable,
          codexModel,
          codexWebSearchEnabled,
          onPartialError,
        });

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

      if (codexPulse?.output.cards.length) {
        const memberDeptIds = new Set(
          departments
            .filter((d) => d.memberships.some((m) => m.userId === userId))
            .map((d) => d.id),
        );

        let webIdx = 0;
        let internalIdx = 0;
        for (const c of codexPulse.output.cards) {
          const mapped =
            c.department && codexPulse.departmentNameToId.has(c.department)
              ? codexPulse.departmentNameToId.get(c.department) ?? null
              : null;
          const departmentId = mapped && memberDeptIds.has(mapped) ? mapped : null;

          if (c.kind === "WEB_RESEARCH") {
            cards.push({
              editionId: edition.id,
              kind: "WEB_RESEARCH",
              departmentId,
              title: c.title,
              body: c.body,
              why: c.why,
              action: c.action,
              sources: toJsonCitations(c.citations),
              priority: 700 - webIdx,
            });
            webIdx += 1;
          } else {
            cards.push({
              editionId: edition.id,
              kind: "INTERNAL",
              departmentId,
              title: c.title,
              body: c.body,
              why: c.why,
              action: c.action,
              sources: c.citations.length ? toJsonCitations(c.citations) : undefined,
              priority: 650 - internalIdx,
            });
            internalIdx += 1;
          }
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
