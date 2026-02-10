import type { Prisma } from "@starbeam/db";
import { prisma } from "@starbeam/db";
import { isActiveWithinWindow } from "@starbeam/shared";
import { z } from "zod";

import { isCodexInstalled } from "../lib/codex/exec";
import { isValidIanaTimeZone, startOfDayKeyUtcForTimeZone } from "../lib/dates";
import { bootstrapWorkspaceConfigIfNeeded } from "../lib/workspaceBootstrap";

import {
  generateLegacyDepartmentWebResearchCards,
  priorityForGoal,
  syncUserConnectorsAndMaybeCodex,
  toJsonCitations,
} from "./nightlyWorkspaceRunHelpers";

const NightlyWorkspaceRunPayloadSchema = z.object({
  workspaceId: z.string().min(1),
  jobRunId: z.string().min(1),
  userId: z.string().min(1).optional(),
});

function isTruthyEnv(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes((value ?? "").trim().toLowerCase());
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

export async function nightly_workspace_run(payload: unknown) {
  const parsed = NightlyWorkspaceRunPayloadSchema.safeParse(payload);
  if (!parsed.success) throw new Error("Invalid nightly job payload");

  const { workspaceId, jobRunId } = parsed.data;
  const targetUserId = parsed.data.userId ?? null;

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
    const runAt = new Date();
    const jobMeta =
      typeof jobRun.meta === "object" && jobRun.meta
        ? (jobRun.meta as Record<string, unknown>)
        : null;
    const runSource =
      jobMeta && typeof jobMeta.source === "string" ? jobMeta.source : null;
    const metaTriggeredByUserId =
      jobMeta && typeof jobMeta.triggeredByUserId === "string"
        ? jobMeta.triggeredByUserId
        : null;

    const [
      workspace,
      initialProfile,
      memberships,
      initialGoals,
      announcements,
      departments,
    ] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true, slug: true },
      }),
      prisma.workspaceProfile.findUnique({
        where: { workspaceId },
        select: {
          websiteUrl: true,
          description: true,
          competitorDomains: true,
        },
      }),
      prisma.membership.findMany({
        where: { workspaceId },
        select: {
          userId: true,
          lastActiveAt: true,
          user: { select: { timezone: true } },
        },
      }),
      prisma.goal.findMany({
        where: { workspaceId, active: true },
        select: {
          id: true,
          title: true,
          body: true,
          priority: true,
          departmentId: true,
        },
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

    let profile = initialProfile;
    let goals = initialGoals;

    const membershipByUserId = new Map<
      string,
      { timezone: string; lastActiveAt: Date | null }
    >();
    for (const m of memberships)
      membershipByUserId.set(m.userId, {
        timezone: m.user.timezone,
        lastActiveAt: m.lastActiveAt,
      });

    const allMemberUserIds = memberships.map((m) => m.userId);
    const activeWindowDays = parseIntEnv("STARB_ACTIVE_WINDOW_DAYS", 7);
    const isActiveUserId = (userId: string): boolean =>
      isActiveWithinWindow({
        lastActiveAt: membershipByUserId.get(userId)?.lastActiveAt ?? null,
        now: runAt,
        windowDays: activeWindowDays,
      });

    const activeMemberUserIds = allMemberUserIds.filter(isActiveUserId);

    const memberUserIds = targetUserId ? [targetUserId] : activeMemberUserIds;
    if (targetUserId && !membershipByUserId.has(targetUserId)) {
      throw new Error("Target user is not a workspace member");
    }
    const treatTargetAsActive =
      Boolean(targetUserId) &&
      (runSource === "web" || runSource === "auto-first");
    const activeRunUserIds = memberUserIds.filter(
      (userId) =>
        isActiveUserId(userId) ||
        (treatTargetAsActive && userId === targetUserId),
    );
    const activeRunUserIdSet = new Set(activeRunUserIds);

    const [
      googleConnections,
      githubConnections,
      linearConnections,
      notionConnections,
    ] = await Promise.all([
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

    const googleConnectionsByUser = new Map<
      string,
      Array<{ id: string; email: string }>
    >();
    for (const c of googleConnections) {
      const list = googleConnectionsByUser.get(c.ownerUserId) ?? [];
      list.push({ id: c.id, email: c.googleAccountEmail });
      googleConnectionsByUser.set(c.ownerUserId, list);
    }

    const githubConnectionsByUser = new Map<
      string,
      Array<{ id: string; login: string }>
    >();
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
    const codexApiKey = (process.env.CODEX_API_KEY ?? openaiApiKey).trim();
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
    const codexDetect =
      codexExecEnabled && codexApiKey && activeRunUserIds.length
        ? await isCodexInstalled()
        : null;
    const codexAvailable = Boolean(codexDetect?.ok);

    if (codexExecEnabled && !codexApiKey && activeRunUserIds.length) {
      onPartialError("CODEX_API_KEY missing; Codex pulse generation skipped.");
    } else if (
      codexExecEnabled &&
      codexApiKey &&
      activeRunUserIds.length &&
      !codexAvailable
    ) {
      onPartialError("Codex unavailable; pulse generation skipped (see logs).");
      console.warn("[nightly_workspace_run] Codex unavailable", {
        workspaceId,
        jobRunId: jobRun.id,
        codexDetect,
      });
    }

    // "Wow from day one": when running the first pulse (auto-first or explicit run),
    // try to auto-bootstrap a profile + starter goals to give Codex clearer direction.
    try {
      const triggeredByUserId =
        metaTriggeredByUserId ??
        targetUserId ??
        activeRunUserIds[0] ??
        allMemberUserIds[0] ??
        null;
      const isFirstRunSource =
        runSource === "auto-first" || runSource === "web";
      const needsBootstrap = !profile || goals.length === 0;

      if (isFirstRunSource && needsBootstrap && triggeredByUserId) {
        if (!codexAvailable) {
          onPartialError("Workspace bootstrap skipped (Codex unavailable).");
        } else if (!isActiveUserId(triggeredByUserId)) {
          onPartialError("Workspace bootstrap skipped (user inactive).");
        } else {
          await bootstrapWorkspaceConfigIfNeeded({
            workspaceId,
            triggeredByUserId,
            codex: {
              available: codexAvailable,
              model: codexModel,
              reasoningEffort: codexReasoningEffort,
              enableWebSearch: codexWebSearchEnabled,
            },
          });

          // Refresh in-memory context for the remainder of this job.
          [profile, goals] = await Promise.all([
            prisma.workspaceProfile.findUnique({
              where: { workspaceId },
              select: {
                websiteUrl: true,
                description: true,
                competitorDomains: true,
              },
            }),
            prisma.goal.findMany({
              where: { workspaceId, active: true },
              select: {
                id: true,
                title: true,
                body: true,
                priority: true,
                departmentId: true,
              },
              orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
              take: 10,
            }),
          ]);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onPartialError(`Workspace bootstrap failed: ${msg}`);
    }

    const legacyOverride = (
      process.env.STARB_LEGACY_DEPT_WEB_RESEARCH_ENABLED ?? ""
    )
      .trim()
      .toLowerCase();
    const legacyDeptWebResearchEnabled = legacyOverride
      ? isTruthyEnv(legacyOverride)
      : !codexAvailable;

    const legacyWillRun =
      legacyDeptWebResearchEnabled && activeRunUserIds.length > 0;
    if (legacyWillRun && !openaiApiKey) {
      onPartialError("OPENAI_API_KEY missing; legacy web research skipped.");
    }

    const legacyResearchDepartments = departments.filter((d) =>
      d.memberships.some((m) => activeRunUserIdSet.has(m.userId)),
    );
    const deptCardsByDeptId = await generateLegacyDepartmentWebResearchCards({
      enabled: Boolean(openaiApiKey) && legacyWillRun,
      openaiApiKey,
      model: openaiModel,
      workspace,
      profile,
      goals,
      departments: legacyResearchDepartments,
      onPartialError,
    });

    const codexEstimates = {
      runs: 0,
      promptBytes: 0,
      contextBytes: 0,
      approxInputTokens: 0,
      approxOutputTokens: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      durationMs: 0,
    };

    for (const userId of memberUserIds) {
      const tzRaw =
        (membershipByUserId.get(userId)?.timezone ?? "UTC").trim() || "UTC";
      const timezone = isValidIanaTimeZone(tzRaw) ? tzRaw : "UTC";
      const editionDate = startOfDayKeyUtcForTimeZone(runAt, timezone);
      const isActiveForRun = activeRunUserIdSet.has(userId);

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
        codexAvailable: codexAvailable && isActiveForRun,
        codexModel,
        codexReasoningEffort,
        codexWebSearchEnabled: codexWebSearchEnabled && isActiveForRun,
        editionDate,
        onPartialError,
      });

      if (codexPulse?.estimate) {
        codexEstimates.runs += 1;
        codexEstimates.promptBytes += codexPulse.estimate.promptBytes;
        codexEstimates.contextBytes += codexPulse.estimate.contextBytes;
        codexEstimates.approxInputTokens +=
          codexPulse.estimate.approxInputTokens;
        codexEstimates.approxOutputTokens +=
          codexPulse.estimate.approxOutputTokens;
        if (codexPulse.estimate.usage) {
          codexEstimates.inputTokens += codexPulse.estimate.usage.inputTokens;
          codexEstimates.cachedInputTokens +=
            codexPulse.estimate.usage.cachedInputTokens;
          codexEstimates.outputTokens += codexPulse.estimate.usage.outputTokens;
        }
        codexEstimates.durationMs += codexPulse.estimate.durationMs;
      }

      const edition = await prisma.pulseEdition.upsert({
        where: {
          workspaceId_userId_editionDate: {
            workspaceId,
            userId,
            editionDate,
          },
        },
        update: { status: "GENERATING", timezone },
        create: {
          workspaceId,
          userId,
          editionDate,
          timezone,
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
              ? (codexPulse.departmentNameToId.get(c.department) ?? null)
              : null;
          const departmentId =
            mapped && memberDeptIds.has(mapped) ? mapped : null;

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
              sources: c.citations.length
                ? toJsonCitations(c.citations)
                : undefined,
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
        meta: {
          ...(typeof jobRun.meta === "object" && jobRun.meta
            ? (jobRun.meta as object)
            : {}),
          codex: {
            model: codexModel,
            reasoningEffort: codexReasoningEffort,
            webSearch: codexWebSearchEnabled,
            activeWindowDays,
            activeRunUsers: activeRunUserIds.length,
            ...(codexDetect ? { detect: codexDetect } : {}),
            estimates: codexEstimates,
          },
        },
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
