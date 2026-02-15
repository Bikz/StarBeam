import type { Prisma } from "@starbeam/db";
import { prisma } from "@starbeam/db";
import { isActiveWithinWindow } from "@starbeam/shared";
import { z } from "zod";

import { isCodexInstalled } from "../lib/codex/exec";
import { isValidIanaTimeZone, startOfDayKeyUtcForTimeZone } from "../lib/dates";
import {
  isCompactionEnabled,
  isDiscoveredSkillExecutionEnabled,
  isGoalHelpfulnessEvalEnabled,
  isHybridRankerEnabled,
  isInsightEngineV2Enabled,
  isOpenAIHostedShellEnabled,
  isOpsManualSkillControlEnabled,
  isPersonaSubmodesEnabled,
  isPersonaRouterEnabled,
  isSkillDiscoveryShadowEnabled,
  isSkillRouterEnabled,
} from "../lib/flags";
import {
  classifyPersonaSubmode,
  classifyPersonaTrack,
  type PersonaSubmode,
  type PersonaTrack,
} from "../lib/insights/persona";
import {
  applySkillPolicy,
  allowPartnerSkills,
  shouldUseDiscoveredSkill,
  type EvaluatedDiscoveredSkill,
} from "../lib/insights/policy";
import {
  discoverExternalSkillCandidates,
  evaluateDiscoveredSkillCandidate,
} from "../lib/insights/skillDiscovery";
import { loadInsightManualControls } from "../lib/insights/manualControls";
import {
  normalizeInsightMeta,
  rankInsightCards,
  type InsightMeta,
} from "../lib/insights/ranker";
import { skillsForPersona } from "../lib/insights/skillRegistry";
import { bootstrapWorkspaceConfigIfNeeded } from "../lib/workspaceBootstrap";

import {
  buildDeterministicFallbackInternalCards,
  generateLegacyDepartmentWebResearchCards,
  priorityForGoal,
  syncUserConnectorsAndMaybeCodex,
  toJsonCitations,
} from "./nightlyWorkspaceRunHelpers";
import {
  classifyActivationFailure,
  summarizeActivationFailureReason,
} from "./activationFailure";

const NightlyWorkspaceRunPayloadSchema = z.object({
  workspaceId: z.string().min(1),
  jobRunId: z.string().min(1),
  userId: z.string().min(1).optional(),
  includeInactive: z.boolean().optional(),
});
const WORKSPACE_GOALS_FETCH_LIMIT = 50;

function isTruthyEnv(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes((value ?? "").trim().toLowerCase());
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function parsePromptCacheRetentionEnv(
  value: string | undefined,
): "in_memory" | "24h" | undefined {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "in_memory" || normalized === "24h") return normalized;
  return undefined;
}

function pulseMin5Enabled(): boolean {
  if (process.env.STARB_PULSE_MIN5_V1 === undefined) return true;
  return isTruthyEnv(process.env.STARB_PULSE_MIN5_V1);
}

function sourceWithInsightMeta(
  sources: Prisma.InputJsonValue | undefined,
  insightMeta: InsightMeta,
): Prisma.InputJsonValue {
  const base =
    sources && typeof sources === "object" && !Array.isArray(sources)
      ? ({ ...(sources as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  return {
    ...base,
    insightMeta: {
      personaTrack: insightMeta.personaTrack,
      ...(insightMeta.personaSubmode
        ? { personaSubmode: insightMeta.personaSubmode }
        : {}),
      ...(insightMeta.skillRef ? { skillRef: insightMeta.skillRef } : {}),
      ...(insightMeta.skillOrigin
        ? { skillOrigin: insightMeta.skillOrigin }
        : {}),
      ...(typeof insightMeta.expectedHelpfulLift === "number"
        ? { expectedHelpfulLift: insightMeta.expectedHelpfulLift }
        : {}),
      ...(typeof insightMeta.expectedActionLift === "number"
        ? { expectedActionLift: insightMeta.expectedActionLift }
        : {}),
      relevanceScore: insightMeta.relevanceScore,
      actionabilityScore: insightMeta.actionabilityScore,
      confidenceScore: insightMeta.confidenceScore,
      noveltyScore: insightMeta.noveltyScore,
    },
  };
}

type OutcomePrior = { helpfulRatePct: number; actionCompletionRatePct: number };

function toRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

async function buildHybridOutcomePriors(args: {
  workspaceId: string;
  userId: string;
  lookbackDays: number;
}): Promise<{
  bySkillRef: Record<string, OutcomePrior>;
  bySubmode: Record<string, OutcomePrior>;
}> {
  const lookback = Math.max(1, Math.min(60, Math.floor(args.lookbackDays)));
  const windowStart = new Date(Date.now() - lookback * 24 * 60 * 60 * 1000);

  const deliveries = await prisma.insightDelivery.findMany({
    where: {
      workspaceId: args.workspaceId,
      userId: args.userId,
      createdAt: { gte: windowStart },
    },
    select: { cardId: true, skillRef: true, personaSubmode: true },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  if (deliveries.length === 0) {
    return { bySkillRef: {}, bySubmode: {} };
  }

  const interactions = await prisma.insightInteraction.findMany({
    where: {
      workspaceId: args.workspaceId,
      userId: args.userId,
      createdAt: { gte: windowStart },
      cardId: { in: deliveries.map((d) => d.cardId) },
    },
    select: { cardId: true, interactionType: true },
  });

  const countsByCardId = new Map<
    string,
    { viewed: number; helpful: number; markedDone: number }
  >();
  for (const row of interactions) {
    const counts = countsByCardId.get(row.cardId) ?? {
      viewed: 0,
      helpful: 0,
      markedDone: 0,
    };
    if (row.interactionType === "VIEWED") counts.viewed += 1;
    if (row.interactionType === "HELPFUL") counts.helpful += 1;
    if (row.interactionType === "MARKED_DONE") counts.markedDone += 1;
    countsByCardId.set(row.cardId, counts);
  }

  const aggBySkill = new Map<
    string,
    { viewed: number; helpful: number; markedDone: number }
  >();
  const aggBySubmode = new Map<
    string,
    { viewed: number; helpful: number; markedDone: number }
  >();

  for (const delivery of deliveries) {
    const counts = countsByCardId.get(delivery.cardId) ?? {
      viewed: 0,
      helpful: 0,
      markedDone: 0,
    };
    if (delivery.skillRef) {
      const prev = aggBySkill.get(delivery.skillRef) ?? {
        viewed: 0,
        helpful: 0,
        markedDone: 0,
      };
      prev.viewed += counts.viewed;
      prev.helpful += counts.helpful;
      prev.markedDone += counts.markedDone;
      aggBySkill.set(delivery.skillRef, prev);
    }

    const submodeKey = delivery.personaSubmode;
    const prevSubmode = aggBySubmode.get(submodeKey) ?? {
      viewed: 0,
      helpful: 0,
      markedDone: 0,
    };
    prevSubmode.viewed += counts.viewed;
    prevSubmode.helpful += counts.helpful;
    prevSubmode.markedDone += counts.markedDone;
    aggBySubmode.set(submodeKey, prevSubmode);
  }

  const bySkillRef: Record<string, OutcomePrior> = {};
  for (const [skillRef, counts] of aggBySkill.entries()) {
    bySkillRef[skillRef] = {
      helpfulRatePct: toRate(counts.helpful, counts.viewed),
      actionCompletionRatePct: toRate(counts.markedDone, counts.viewed),
    };
  }

  const bySubmode: Record<string, OutcomePrior> = {};
  for (const [submode, counts] of aggBySubmode.entries()) {
    bySubmode[submode] = {
      helpfulRatePct: toRate(counts.helpful, counts.viewed),
      actionCompletionRatePct: toRate(counts.markedDone, counts.viewed),
    };
  }

  return { bySkillRef, bySubmode };
}

export async function nightly_workspace_run(payload: unknown) {
  const parsed = NightlyWorkspaceRunPayloadSchema.safeParse(payload);
  if (!parsed.success) throw new Error("Invalid nightly job payload");

  const { workspaceId, jobRunId } = parsed.data;
  const targetUserId = parsed.data.userId ?? null;
  const includeInactive = parsed.data.includeInactive ?? false;

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
      initialWorkspaceGoals,
      announcements,
      departments,
    ] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true, slug: true, programType: true },
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
          primaryDepartmentId: true,
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
        take: WORKSPACE_GOALS_FETCH_LIMIT,
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
    let workspaceGoals = initialWorkspaceGoals;

    const membershipByUserId = new Map<
      string,
      {
        timezone: string;
        lastActiveAt: Date | null;
        primaryDepartmentId: string | null;
      }
    >();
    for (const m of memberships)
      membershipByUserId.set(m.userId, {
        timezone: m.user.timezone,
        lastActiveAt: m.lastActiveAt,
        primaryDepartmentId: m.primaryDepartmentId,
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

    const memberUserIds = targetUserId
      ? [targetUserId]
      : includeInactive
        ? allMemberUserIds
        : activeMemberUserIds;
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
    const pulseMinCards = 5;
    const pulseMaxCards = 7;
    const enforcePulseMin5 = pulseMin5Enabled();
    const generalDepartmentId =
      departments.find((department) => department.name === "General")?.id ??
      null;

    const sourceCutoff = new Date(runAt.getTime() - 14 * 24 * 60 * 60 * 1000);
    const doneTaskCutoff = new Date(runAt.getTime() - 10 * 24 * 60 * 60 * 1000);

    const [
      personalProfiles,
      personalGoals,
      userTasks,
      sourceItemsForFallback,
      googleConnections,
      githubConnections,
      linearConnections,
      notionConnections,
    ] = await Promise.all([
      prisma.workspaceMemberProfile.findMany({
        where: { workspaceId, userId: { in: memberUserIds } },
        select: {
          userId: true,
          fullName: true,
          location: true,
          company: true,
          companyUrl: true,
          linkedinUrl: true,
          websiteUrl: true,
          jobTitle: true,
          about: true,
        },
      }),
      prisma.personalGoal.findMany({
        where: { workspaceId, userId: { in: memberUserIds } },
        select: {
          id: true,
          workspaceId: true,
          userId: true,
          title: true,
          body: true,
          active: true,
          targetWindow: true,
          createdAt: true,
        },
        orderBy: [{ active: "desc" }, { createdAt: "desc" }],
        take: 500,
      }),
      prisma.task.findMany({
        where: {
          workspaceId,
          userId: { in: memberUserIds },
          OR: [
            { status: "OPEN" },
            { status: "SNOOZED" },
            { status: "DONE", updatedAt: { gte: doneTaskCutoff } },
          ],
        },
        select: {
          id: true,
          userId: true,
          title: true,
          body: true,
          status: true,
          dueAt: true,
          snoozedUntil: true,
          updatedAt: true,
          sourceItem: {
            select: { id: true, type: true, title: true, url: true },
          },
        },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        take: 1200,
      }),
      prisma.sourceItem.findMany({
        where: {
          workspaceId,
          ownerUserId: { in: memberUserIds },
          occurredAt: { gte: sourceCutoff },
          type: {
            in: [
              "DRIVE_FILE",
              "GITHUB_ISSUE",
              "GITHUB_PULL_REQUEST",
              "GITHUB_COMMIT",
              "LINEAR_ISSUE",
              "NOTION_PAGE",
            ],
          },
        },
        select: {
          id: true,
          ownerUserId: true,
          type: true,
          title: true,
          snippet: true,
          contentText: true,
          url: true,
          occurredAt: true,
        },
        orderBy: { occurredAt: "desc" },
        take: 1200,
      }),
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

    const personalProfileByUser = new Map<
      string,
      {
        fullName: string | null;
        location: string | null;
        company: string | null;
        companyUrl: string | null;
        linkedinUrl: string | null;
        websiteUrl: string | null;
        jobTitle: string | null;
        about: string | null;
      }
    >();
    for (const p of personalProfiles) {
      personalProfileByUser.set(p.userId, {
        fullName: p.fullName,
        location: p.location,
        company: p.company,
        companyUrl: p.companyUrl,
        linkedinUrl: p.linkedinUrl,
        websiteUrl: p.websiteUrl,
        jobTitle: p.jobTitle,
        about: p.about,
      });
    }

    const personalGoalsByUser = new Map<
      string,
      Array<{
        id: string;
        title: string;
        body: string;
        active: boolean;
        targetWindow: string | null;
      }>
    >();
    for (const g of personalGoals) {
      const list = personalGoalsByUser.get(g.userId) ?? [];
      if (list.length >= 20) continue;
      list.push({
        id: g.id,
        title: g.title,
        body: g.body,
        active: g.active,
        targetWindow: g.targetWindow,
      });
      personalGoalsByUser.set(g.userId, list);
    }

    const tasksByUser = new Map<
      string,
      Array<{
        id: string;
        title: string;
        body: string;
        status: "OPEN" | "DONE" | "SNOOZED";
        dueAt: Date | null;
        snoozedUntil: Date | null;
        updatedAt: Date;
        sourceItem: {
          id: string;
          type: string;
          title: string;
          url: string | null;
        } | null;
      }>
    >();
    for (const task of userTasks) {
      const list = tasksByUser.get(task.userId) ?? [];
      list.push({
        id: task.id,
        title: task.title,
        body: task.body,
        status: task.status,
        dueAt: task.dueAt,
        snoozedUntil: task.snoozedUntil,
        updatedAt: task.updatedAt,
        sourceItem: task.sourceItem
          ? {
              id: task.sourceItem.id,
              type: task.sourceItem.type,
              title: task.sourceItem.title,
              url: task.sourceItem.url,
            }
          : null,
      });
      tasksByUser.set(task.userId, list);
    }
    for (const [userId, list] of tasksByUser.entries()) {
      const sorted = list.slice().sort((a, b) => {
        const statusRank = (status: "OPEN" | "SNOOZED" | "DONE"): number => {
          if (status === "OPEN") return 0;
          if (status === "SNOOZED") return 1;
          return 2;
        };
        const rankDiff = statusRank(a.status) - statusRank(b.status);
        if (rankDiff !== 0) return rankDiff;

        if (a.status === "OPEN" && b.status === "OPEN") {
          // Oldest-open tasks first so overnight blockers stay visible to the model.
          return a.updatedAt.getTime() - b.updatedAt.getTime();
        }
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });
      tasksByUser.set(userId, sorted.slice(0, 30));
    }

    const sourceItemsByUser = new Map<
      string,
      Array<{
        id: string;
        type: string;
        title: string;
        snippet: string | null;
        contentText: string | null;
        url: string | null;
        occurredAt: Date;
      }>
    >();
    for (const item of sourceItemsForFallback) {
      const list = sourceItemsByUser.get(item.ownerUserId) ?? [];
      if (list.length >= 30) continue;
      list.push({
        id: item.id,
        type: item.type,
        title: item.title,
        snippet: item.snippet,
        contentText: item.contentText,
        url: item.url,
        occurredAt: item.occurredAt,
      });
      sourceItemsByUser.set(item.ownerUserId, list);
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
      const needsBootstrap = !profile || workspaceGoals.length === 0;

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
          [profile, workspaceGoals] = await Promise.all([
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
              take: WORKSPACE_GOALS_FETCH_LIMIT,
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
    const promptCacheRetentionRaw =
      process.env.STARB_PROMPT_CACHE_RETENTION ?? "";
    const promptCacheRetention = parsePromptCacheRetentionEnv(
      promptCacheRetentionRaw,
    );
    if (promptCacheRetentionRaw.trim() && !promptCacheRetention) {
      onPartialError(
        "Invalid STARB_PROMPT_CACHE_RETENTION; expected in_memory or 24h.",
      );
    }
    const legacyWebResearchUsage = {
      requestsWithUsage: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
    };

    const legacyResearchDepartments = departments.filter((d) =>
      d.memberships.some((m) => activeRunUserIdSet.has(m.userId)),
    );
    const deptCardsByDeptId = await generateLegacyDepartmentWebResearchCards({
      enabled: Boolean(openaiApiKey) && legacyWillRun,
      openaiApiKey,
      model: openaiModel,
      workspace,
      profile,
      goals: workspaceGoals,
      departments: legacyResearchDepartments,
      promptCacheRetention,
      onUsage: (usage) => {
        legacyWebResearchUsage.requestsWithUsage += 1;
        legacyWebResearchUsage.inputTokens += usage.inputTokens;
        legacyWebResearchUsage.cachedInputTokens += usage.cachedInputTokens;
        legacyWebResearchUsage.outputTokens += usage.outputTokens;
      },
      onPartialError,
    });
    const legacyWebResearchCacheHitPct =
      legacyWebResearchUsage.inputTokens > 0
        ? Math.round(
            (legacyWebResearchUsage.cachedInputTokens /
              legacyWebResearchUsage.inputTokens) *
              1000,
          ) / 10
        : 0;

    const codexEstimates = {
      runs: 0,
      attemptCount: 0,
      retryRuns: 0,
      promptBytes: 0,
      contextBytes: 0,
      approxInputTokens: 0,
      approxOutputTokens: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      durationMs: 0,
    };
    const cardMixTotals: Record<
      "ANNOUNCEMENT" | "GOAL" | "WEB_RESEARCH" | "INTERNAL",
      number
    > = {
      ANNOUNCEMENT: 0,
      GOAL: 0,
      WEB_RESEARCH: 0,
      INTERNAL: 0,
    };
    let min5FallbackUsers = 0;
    const insightEngineV2 = isInsightEngineV2Enabled();
    const personaRouterV1 = isPersonaRouterEnabled();
    const skillRouterV1 = isSkillRouterEnabled();
    const skillDiscoveryShadowV1 = isSkillDiscoveryShadowEnabled();
    const openAIHostedShellV1 = isOpenAIHostedShellEnabled();
    const compactionV1 = isCompactionEnabled();
    const personaSubmodesV1 = isPersonaSubmodesEnabled();
    const discoveredSkillExecV1 = isDiscoveredSkillExecutionEnabled();
    const goalHelpfulnessEvalV1 = isGoalHelpfulnessEvalEnabled();
    const hybridRankerV1 = isHybridRankerEnabled();
    const opsManualSkillControlV1 = isOpsManualSkillControlEnabled();
    const manualSkillControls = opsManualSkillControlV1
      ? await loadInsightManualControls()
      : {
          discoveredSkillExecutionEnabled: true,
          disabledSkillRefs: [],
        };
    const discoveredSkillExecutionAllowed =
      discoveredSkillExecV1 &&
      manualSkillControls.discoveredSkillExecutionEnabled;
    const disabledSkillRefs = new Set(
      [
        ...(process.env.STARB_DISABLED_SKILL_REFS ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        ...manualSkillControls.disabledSkillRefs,
      ].filter(Boolean),
    );
    const partnerSkillsEnabled = allowPartnerSkills({
      programType: workspace.programType,
      partnerSkillsFlagEnabled: skillRouterV1,
    });
    const skillDiscoveryShadowMeta: {
      enabled: boolean;
      attempted: boolean;
      personaTrack?: PersonaTrack;
      personaSubmode?: PersonaSubmode;
      candidates: Array<{
        skillRef: string;
        source: "curated" | "partner" | "external";
        fitReason: string;
        risk: "low" | "medium" | "high";
        decision?: "USE" | "SKIP";
        confidence?: number;
        expectedHelpfulLift?: number;
        expectedActionLift?: number;
        expectedLift: {
          helpfulRatePct: number;
          actionCompletionRatePct: number;
        };
      }>;
      error?: string;
    } | null = skillDiscoveryShadowV1
      ? {
          enabled: true,
          attempted: false,
          candidates: [],
        }
      : null;
    let discoveryAttempted = false;
    let cachedDiscoveredSkillEvaluations: EvaluatedDiscoveredSkill[] = [];

    for (const userId of memberUserIds) {
      const tzRaw =
        (membershipByUserId.get(userId)?.timezone ?? "UTC").trim() || "UTC";
      const timezone = isValidIanaTimeZone(tzRaw) ? tzRaw : "UTC";
      const editionDate = startOfDayKeyUtcForTimeZone(runAt, timezone);
      const isActiveForRun = activeRunUserIdSet.has(userId);
      const userMembership = membershipByUserId.get(userId);

      const userDepartmentMembershipIds = new Set(
        departments
          .filter((department) =>
            department.memberships.some((member) => member.userId === userId),
          )
          .map((department) => department.id),
      );
      const relevantDepartmentIds = new Set<string>();
      if (generalDepartmentId) relevantDepartmentIds.add(generalDepartmentId);
      if (userMembership?.primaryDepartmentId) {
        relevantDepartmentIds.add(userMembership.primaryDepartmentId);
      }
      if (relevantDepartmentIds.size === 0) {
        for (const deptId of userDepartmentMembershipIds) {
          relevantDepartmentIds.add(deptId);
        }
      }

      const userDepartments = departments.filter((department) =>
        relevantDepartmentIds.has(department.id),
      );
      const userWorkspaceGoals = workspaceGoals.filter(
        (goal) =>
          !goal.departmentId || relevantDepartmentIds.has(goal.departmentId),
      );
      const userPersonalProfile = personalProfileByUser.get(userId) ?? null;
      const userPersonalGoals = personalGoalsByUser.get(userId) ?? [];
      const userTasks = tasksByUser.get(userId) ?? [];
      const userSourceItems = sourceItemsByUser.get(userId) ?? [];
      const integrationCountForUser =
        (googleConnectionsByUser.get(userId)?.length ?? 0) +
        (githubConnectionsByUser.get(userId)?.length ?? 0) +
        (linearConnectionsByUser.get(userId)?.length ?? 0) +
        (notionConnectionsByUser.get(userId)?.length ?? 0);
      const openTaskCount = userTasks.filter(
        (task) => task.status === "OPEN",
      ).length;
      const hasGoalsForUser =
        userPersonalGoals.some((goal) => goal.active) ||
        userWorkspaceGoals.length > 0;
      const personaTrack: PersonaTrack = personaRouterV1
        ? classifyPersonaTrack({
            memberCount: memberships.length,
            activeMemberCount: activeRunUserIds.length,
            integrationCount: integrationCountForUser,
            openTaskCount,
            hasPersonalProfile: Boolean(
              userPersonalProfile &&
              ((userPersonalProfile.jobTitle ?? "").trim() ||
                (userPersonalProfile.about ?? "").trim()),
            ),
            hasGoals: hasGoalsForUser,
          })
        : "UNKNOWN";
      const personaSubmode: PersonaSubmode = personaSubmodesV1
        ? classifyPersonaSubmode({
            personaTrack,
            activeMemberCount: activeRunUserIds.length,
            integrationCount: integrationCountForUser,
            openTaskCount,
            hasGoals: hasGoalsForUser,
          })
        : "UNKNOWN";
      const curatedSkills = skillRouterV1
        ? applySkillPolicy({
            skills: skillsForPersona(personaTrack),
            includePartnerSkills: partnerSkillsEnabled,
            maxSkills: 3,
          })
        : [];
      const curatedSkillRefs = curatedSkills.map((skill) => skill.ref);
      const curatedSkillSourceByRef = new Map(
        curatedSkills.map((skill) => [skill.ref, skill.source]),
      );
      let discoveredSkillEvaluations = cachedDiscoveredSkillEvaluations.slice();
      if (
        !discoveryAttempted &&
        isActiveForRun &&
        (skillDiscoveryShadowV1 || discoveredSkillExecV1)
      ) {
        discoveryAttempted = true;
        if (skillDiscoveryShadowMeta) {
          skillDiscoveryShadowMeta.attempted = true;
          skillDiscoveryShadowMeta.personaTrack = personaTrack;
          skillDiscoveryShadowMeta.personaSubmode = personaSubmode;
        }
        if (openaiApiKey) {
          try {
            const discovery = await discoverExternalSkillCandidates({
              openaiApiKey,
              model: process.env.STARB_SKILL_DISCOVERY_MODEL ?? "gpt-5.2",
              workspaceName: workspace.name,
              personaTrack,
              allowedSkillRefs: curatedSkillRefs,
              profile,
              goals: userWorkspaceGoals.map((goal) => ({
                title: goal.title,
                body: goal.body,
                priority: goal.priority,
              })),
              tasks: userTasks.map((task) => ({
                title: task.title,
                status: task.status,
                sourceType: task.sourceItem?.type ?? null,
                updatedAt: task.updatedAt,
              })),
            });
            discoveredSkillEvaluations = [];
            for (const candidate of discovery.candidates) {
              let evaluated: EvaluatedDiscoveredSkill = {
                skillRef: candidate.skillRef,
                source: candidate.source,
                fitReason: candidate.fitReason,
                risk: candidate.risk,
                expectedHelpfulLift:
                  candidate.expectedLift.helpfulRatePct / 100,
                expectedActionLift:
                  candidate.expectedLift.actionCompletionRatePct / 100,
                confidence: candidate.risk === "low" ? 0.7 : 0.55,
                decision:
                  candidate.expectedLift.helpfulRatePct >= 10 &&
                  candidate.risk !== "high"
                    ? "USE"
                    : "SKIP",
              };

              if (goalHelpfulnessEvalV1) {
                try {
                  const evalResult = await evaluateDiscoveredSkillCandidate({
                    openaiApiKey,
                    model:
                      process.env.STARB_GOAL_HELPFULNESS_EVAL_MODEL ??
                      "gpt-5.2",
                    workspaceName: workspace.name,
                    personaTrack,
                    personaSubmode,
                    goals: userWorkspaceGoals.map((goal) => ({
                      title: goal.title,
                      body: goal.body,
                      priority: goal.priority,
                    })),
                    tasks: userTasks.map((task) => ({
                      title: task.title,
                      status: task.status,
                      sourceType: task.sourceItem?.type ?? null,
                      updatedAt: task.updatedAt,
                    })),
                    candidate,
                  });
                  evaluated = {
                    ...evaluated,
                    fitReason: evalResult.fitReason,
                    risk: evalResult.risk,
                    expectedHelpfulLift: evalResult.expectedHelpfulLift,
                    expectedActionLift: evalResult.expectedActionLift,
                    confidence: evalResult.confidence,
                    decision: evalResult.decision,
                  };
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  onPartialError(
                    `Goal helpfulness evaluator failed for ${candidate.skillRef}: ${msg}`,
                  );
                }
              }

              discoveredSkillEvaluations.push(evaluated);
            }

            cachedDiscoveredSkillEvaluations =
              discoveredSkillEvaluations.slice();
            if (skillDiscoveryShadowMeta) {
              skillDiscoveryShadowMeta.candidates =
                discoveredSkillEvaluations.map((candidate) => ({
                  skillRef: candidate.skillRef,
                  source: candidate.source,
                  fitReason: candidate.fitReason,
                  risk: candidate.risk,
                  decision: candidate.decision,
                  confidence: candidate.confidence,
                  expectedHelpfulLift: candidate.expectedHelpfulLift,
                  expectedActionLift: candidate.expectedActionLift,
                  expectedLift: {
                    helpfulRatePct:
                      Math.round(candidate.expectedHelpfulLift * 1000) / 10,
                    actionCompletionRatePct:
                      Math.round(candidate.expectedActionLift * 1000) / 10,
                  },
                }));
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (skillDiscoveryShadowMeta) {
              skillDiscoveryShadowMeta.error = msg.slice(0, 400);
            }
            onPartialError(`Skill discovery shadow failed: ${msg}`);
          }
        } else {
          if (skillDiscoveryShadowMeta) {
            skillDiscoveryShadowMeta.error = "OPENAI_API_KEY missing";
          }
        }
      }
      const shouldExecuteDiscoveredSkill = (
        candidate: EvaluatedDiscoveredSkill,
      ): boolean =>
        discoveredSkillExecutionAllowed &&
        shouldUseDiscoveredSkill(candidate) &&
        !disabledSkillRefs.has(candidate.skillRef);
      const discoveredSkillRefs = discoveredSkillExecutionAllowed
        ? discoveredSkillEvaluations
            .filter((candidate) => shouldExecuteDiscoveredSkill(candidate))
            .map((candidate) => candidate.skillRef)
        : [];
      const allowedSkillRefs = Array.from(
        new Set([...curatedSkillRefs, ...discoveredSkillRefs]),
      )
        .filter((skillRef) => !disabledSkillRefs.has(skillRef))
        .slice(0, 5);
      const discoveredSkillByRef = new Map(
        discoveredSkillEvaluations.map((candidate) => [
          candidate.skillRef,
          candidate,
        ]),
      );
      const skillOriginForRef = (
        skillRef: string | undefined,
      ): "CURATED" | "PARTNER" | "DISCOVERED" | undefined => {
        if (!skillRef) return undefined;
        if (discoveredSkillByRef.has(skillRef)) return "DISCOVERED";
        const source = curatedSkillSourceByRef.get(skillRef);
        if (source === "PARTNER") return "PARTNER";
        if (source === "CURATED") return "CURATED";
        return undefined;
      };

      if (discoveredSkillEvaluations.length) {
        await prisma.skillCandidate.createMany({
          data: discoveredSkillEvaluations.map((candidate) => ({
            workspaceId,
            userId,
            runId: jobRun.id,
            personaTrack,
            personaSubmode,
            skillRef: candidate.skillRef,
            source: candidate.source,
            fitReason: candidate.fitReason,
            risk: candidate.risk,
            decision: candidate.decision,
            expectedHelpfulLift: candidate.expectedHelpfulLift,
            expectedActionLift: candidate.expectedActionLift,
            confidence: candidate.confidence,
            evaluatorMetadata: {
              gateVersion: "goal_helpfulness_evaluator_v1",
              usedForExecution: shouldExecuteDiscoveredSkill(candidate),
            },
          })),
        });
      }
      const hadReadyEditionBefore = await prisma.pulseEdition.findFirst({
        where: { workspaceId, userId, status: "READY" },
        select: { id: true },
      });

      const codexPulse = await syncUserConnectorsAndMaybeCodex({
        workspaceId,
        workspace,
        profile,
        goals: userWorkspaceGoals,
        personalProfile: userPersonalProfile,
        personalGoals: userPersonalGoals,
        tasks: userTasks,
        departments: userDepartments,
        userId,
        googleConnections: googleConnectionsByUser.get(userId) ?? [],
        githubConnections: githubConnectionsByUser.get(userId) ?? [],
        linearConnections: linearConnectionsByUser.get(userId) ?? [],
        notionConnections: notionConnectionsByUser.get(userId) ?? [],
        codexAvailable: codexAvailable && isActiveForRun,
        codexModel,
        codexReasoningEffort,
        codexWebSearchEnabled: codexWebSearchEnabled && isActiveForRun,
        openaiHostedShellEnabled: openAIHostedShellV1 && isActiveForRun,
        openaiApiKey,
        compactionEnabled: compactionV1,
        personaTrack,
        personaSubmode,
        allowedSkillRefs,
        editionDate,
        onPartialError,
      });

      if (codexPulse?.estimate) {
        codexEstimates.runs += 1;
        codexEstimates.attemptCount += codexPulse.estimate.attemptCount;
        if (codexPulse.estimate.attemptCount > 1) {
          codexEstimates.retryRuns += 1;
        }
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
      type CardOrigin =
        | "system"
        | "legacy_web_research"
        | "codex"
        | "hosted_shell";
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
        insightMeta: InsightMeta;
        origin: CardOrigin;
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
          insightMeta: normalizeInsightMeta({
            personaTrack,
            personaSubmode,
            relevanceScore: 0.78,
            actionabilityScore: 0.55,
            confidenceScore: 0.95,
            noveltyScore: 0.3,
          }),
          origin: "system",
        });
      }

      for (const g of userWorkspaceGoals) {
        cards.push({
          editionId: edition.id,
          kind: "GOAL",
          departmentId: g.departmentId,
          title: g.title,
          body: g.body ?? "",
          why: "Active goal for this workspace.",
          action: "Use this to prioritize today.",
          priority: priorityForGoal(g.priority),
          insightMeta: normalizeInsightMeta({
            personaTrack,
            personaSubmode,
            relevanceScore: 0.84,
            actionabilityScore: 0.7,
            confidenceScore: 0.92,
            noveltyScore: 0.28,
          }),
          origin: "system",
        });
      }

      for (const dept of userDepartments) {
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
            insightMeta: normalizeInsightMeta({
              personaTrack,
              personaSubmode,
              skillRef: allowedSkillRefs[0],
              skillOrigin: skillOriginForRef(allowedSkillRefs[0]),
              expectedHelpfulLift: discoveredSkillByRef.get(
                allowedSkillRefs[0] ?? "",
              )?.expectedHelpfulLift,
              expectedActionLift: discoveredSkillByRef.get(
                allowedSkillRefs[0] ?? "",
              )?.expectedActionLift,
              relevanceScore: 0.74,
              actionabilityScore: 0.62,
              confidenceScore: 0.68,
              noveltyScore: 0.72,
            }),
            origin: "legacy_web_research",
          });
        }
      }

      if (codexPulse?.output.cards.length) {
        const memberDeptIds = new Set(userDepartments.map((d) => d.id));
        const codexOrigin: CardOrigin =
          codexPulse.estimate.provider === "openai_hosted_shell"
            ? "hosted_shell"
            : "codex";

        let webIdx = 0;
        let internalIdx = 0;
        for (const c of codexPulse.output.cards) {
          const chosenSkillRef =
            c.insightMeta?.skillRef &&
            allowedSkillRefs.includes(c.insightMeta.skillRef)
              ? c.insightMeta.skillRef
              : allowedSkillRefs[0];
          const discoveredEval = chosenSkillRef
            ? discoveredSkillByRef.get(chosenSkillRef)
            : undefined;
          const codexMeta = normalizeInsightMeta({
            personaTrack,
            personaSubmode,
            skillRef: chosenSkillRef,
            skillOrigin: skillOriginForRef(chosenSkillRef),
            expectedHelpfulLift:
              discoveredEval?.expectedHelpfulLift ??
              c.insightMeta?.expectedHelpfulLift,
            expectedActionLift:
              discoveredEval?.expectedActionLift ??
              c.insightMeta?.expectedActionLift,
            relevanceScore: c.insightMeta?.relevanceScore,
            actionabilityScore: c.insightMeta?.actionabilityScore,
            confidenceScore: c.insightMeta?.confidenceScore,
            noveltyScore: c.insightMeta?.noveltyScore,
          });
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
              sources: toJsonCitations(c.citations, codexMeta),
              priority: 700 - webIdx,
              insightMeta: codexMeta,
              origin: codexOrigin,
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
              sources:
                c.citations.length || insightEngineV2
                  ? toJsonCitations(c.citations, codexMeta)
                  : undefined,
              priority: 650 - internalIdx,
              insightMeta: codexMeta,
              origin: codexOrigin,
            });
            internalIdx += 1;
          }
        }
      }

      if (enforcePulseMin5 && cards.length < pulseMinCards) {
        const existingTitles = new Set(cards.map((card) => card.title));
        const fallbackCards = buildDeterministicFallbackInternalCards({
          minCards: pulseMinCards,
          maxCards: pulseMaxCards,
          existingCount: cards.length,
          existingTitles,
          workspaceName: workspace.name,
          personalProfile: userPersonalProfile,
          personalGoals: userPersonalGoals,
          workspaceGoals: userWorkspaceGoals,
          tasks: userTasks,
          sourceItems: userSourceItems,
        });
        if (fallbackCards.length > 0) {
          min5FallbackUsers += 1;
          for (const fallbackCard of fallbackCards) {
            cards.push({
              editionId: edition.id,
              ...fallbackCard,
              insightMeta: normalizeInsightMeta({
                personaTrack,
                personaSubmode,
                relevanceScore: 0.66,
                actionabilityScore: 0.67,
                confidenceScore: 0.72,
                noveltyScore: 0.4,
              }),
              origin: "system",
            });
          }
        }
      }

      let orderedCards = cards.slice();
      const hybridPriors = hybridRankerV1
        ? await buildHybridOutcomePriors({
            workspaceId,
            userId,
            lookbackDays: 14,
          })
        : { bySkillRef: {}, bySubmode: {} };
      if (insightEngineV2 && orderedCards.length) {
        orderedCards = rankInsightCards({
          cards: orderedCards.map((card) => ({
            card,
            title: card.title,
            kind: card.kind,
            insightMeta: card.insightMeta,
          })),
          explorationPct: 0.2,
          seed: `${workspaceId}:${userId}:${editionDate.toISOString().slice(0, 10)}`,
          hybridLearning: {
            enabled: hybridRankerV1,
            priorBySkillRef: hybridPriors.bySkillRef,
            priorBySubmode: hybridPriors.bySubmode,
          },
        }).map((entry) => ({
          ...entry.card,
          insightMeta: entry.insightMeta,
          sources: sourceWithInsightMeta(entry.card.sources, entry.insightMeta),
        }));
      } else {
        orderedCards.sort((a, b) => {
          if (b.priority !== a.priority) return b.priority - a.priority;
          return a.title.localeCompare(b.title);
        });
      }
      const cappedCards = orderedCards.slice(0, pulseMaxCards);

      for (const card of cappedCards) {
        cardMixTotals[card.kind] += 1;
      }

      const createdCards: Array<{
        id: string;
        kind: CardKind;
        priority: number;
        title: string;
        insightMeta: InsightMeta;
        origin: CardOrigin;
      }> = [];
      for (const card of cappedCards) {
        const created = await prisma.pulseCard.create({
          data: {
            editionId: card.editionId,
            kind: card.kind,
            departmentId: card.departmentId ?? null,
            title: card.title,
            body: card.body,
            why: card.why,
            action: card.action,
            sources: sourceWithInsightMeta(card.sources, card.insightMeta),
            priority: card.priority,
          },
          select: { id: true },
        });
        createdCards.push({
          id: created.id,
          kind: card.kind,
          priority: card.priority,
          title: card.title,
          insightMeta: card.insightMeta,
          origin: card.origin,
        });
      }

      if (insightEngineV2 && createdCards.length) {
        await prisma.insightDelivery.createMany({
          data: createdCards.map((card) => ({
            workspaceId,
            userId,
            editionId: edition.id,
            cardId: card.id,
            cardKind: card.kind,
            personaTrack: card.insightMeta.personaTrack,
            personaSubmode: card.insightMeta.personaSubmode ?? "UNKNOWN",
            skillRef: card.insightMeta.skillRef ?? null,
            skillOrigin: card.insightMeta.skillOrigin ?? null,
            expectedHelpfulLift: card.insightMeta.expectedHelpfulLift ?? null,
            expectedActionLift: card.insightMeta.expectedActionLift ?? null,
            relevanceScore: card.insightMeta.relevanceScore,
            actionabilityScore: card.insightMeta.actionabilityScore,
            confidenceScore: card.insightMeta.confidenceScore,
            noveltyScore: card.insightMeta.noveltyScore,
            modelSource:
              card.origin === "codex"
                ? "local_codex"
                : card.origin === "hosted_shell"
                  ? "openai_hosted_shell"
                  : card.origin === "legacy_web_research"
                    ? "legacy_web_research"
                    : "system",
            metadata: {
              runSource,
              title: card.title,
              priority: card.priority,
            },
          })),
        });
      }

      const skillTraceRows = createdCards
        .filter((card) => Boolean(card.insightMeta.skillRef))
        .map((card) => ({
          workspaceId,
          userId,
          runId: jobRun.id,
          cardId: card.id,
          personaTrack: card.insightMeta.personaTrack,
          personaSubmode: card.insightMeta.personaSubmode ?? "UNKNOWN",
          skillRef: card.insightMeta.skillRef ?? "unknown",
          skillOrigin: card.insightMeta.skillOrigin ?? "CURATED",
          decision: "EXECUTED",
          expectedHelpfulLift: card.insightMeta.expectedHelpfulLift ?? null,
          expectedActionLift: card.insightMeta.expectedActionLift ?? null,
          confidence: card.insightMeta.confidenceScore,
          metadata: {
            origin: card.origin,
            title: card.title,
          },
        }));
      if (skillTraceRows.length) {
        await prisma.skillExecutionTrace.createMany({ data: skillTraceRows });
      }

      const skippedDiscovered = discoveredSkillEvaluations.filter(
        (candidate) => !shouldExecuteDiscoveredSkill(candidate),
      );
      if (skippedDiscovered.length) {
        await prisma.skillExecutionTrace.createMany({
          data: skippedDiscovered.map((candidate) => ({
            workspaceId,
            userId,
            runId: jobRun.id,
            personaTrack,
            personaSubmode,
            skillRef: candidate.skillRef,
            skillOrigin: "DISCOVERED",
            decision: "SKIPPED",
            reason: !discoveredSkillExecutionAllowed
              ? "manual:discovered_execution_disabled"
              : disabledSkillRefs.has(candidate.skillRef)
                ? "manual:skill_disabled"
                : `gate:${candidate.decision}:${candidate.risk}`,
            expectedHelpfulLift: candidate.expectedHelpfulLift,
            expectedActionLift: candidate.expectedActionLift,
            confidence: candidate.confidence,
            metadata: {
              fitReason: candidate.fitReason,
            },
          })),
        });
      }

      await prisma.pulseEdition.update({
        where: { id: edition.id },
        data: { status: "READY" },
      });

      if (!hadReadyEditionBefore) {
        const existingFirstReadyEvent = await prisma.usageEvent.findFirst({
          where: { workspaceId, userId, eventType: "FIRST_PULSE_READY" },
          select: { id: true },
        });
        if (!existingFirstReadyEvent) {
          await prisma.usageEvent.create({
            data: {
              workspaceId,
              userId,
              eventType: "FIRST_PULSE_READY",
              source: "worker",
              metadata: {
                editionId: edition.id,
                jobRunId: jobRun.id,
                runSource,
              },
            },
          });
        }
      }
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
          activationFailure:
            partial && errorSummary
              ? {
                  class: classifyActivationFailure(errorSummary),
                  reason: summarizeActivationFailureReason(errorSummary),
                }
              : null,
          codex: {
            model: codexModel,
            reasoningEffort: codexReasoningEffort,
            webSearch: codexWebSearchEnabled,
            insights: {
              engineV2: insightEngineV2,
              personaRouterV1,
              skillRouterV1,
              skillDiscoveryShadowV1,
              openAIHostedShellV1,
              compactionV1,
              personaSubmodesV1,
              discoveredSkillExecV1,
              goalHelpfulnessEvalV1,
              hybridRankerV1,
              opsManualSkillControlV1,
              discoveredSkillExecutionAllowed,
              manualDisabledSkillRefs: manualSkillControls.disabledSkillRefs,
              partnerSkillsEnabled,
            },
            ...(skillDiscoveryShadowMeta
              ? { skillDiscovery: skillDiscoveryShadowMeta }
              : {}),
            activeWindowDays,
            activeRunUsers: activeRunUserIds.length,
            ...(codexDetect ? { detect: codexDetect } : {}),
            estimates: codexEstimates,
            cardMix: cardMixTotals,
            pulsePolicy: {
              minCards: pulseMinCards,
              maxCards: pulseMaxCards,
              min5Enabled: enforcePulseMin5,
              fallbackUsers: min5FallbackUsers,
            },
          },
          legacyWebResearch: {
            enabled: Boolean(openaiApiKey) && legacyWillRun,
            model: openaiModel,
            departmentsEligible: legacyResearchDepartments.length,
            departmentsWithCards: deptCardsByDeptId.size,
            promptCacheRetention: promptCacheRetention ?? "off",
            usage: legacyWebResearchUsage,
            cacheHitPct: legacyWebResearchCacheHitPct,
          },
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Job failed";
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorSummary: message,
        meta: {
          ...(typeof jobRun.meta === "object" && jobRun.meta
            ? (jobRun.meta as object)
            : {}),
          activationFailure: {
            class: classifyActivationFailure(message),
            reason: summarizeActivationFailureReason(message),
          },
        },
      },
    });
    throw err;
  }
}
