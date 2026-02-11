import type { Prisma } from "@starbeam/db";
import { prisma } from "@starbeam/db";

import { persistCodexMemory } from "../lib/codex/memory";
import { generatePulseCardsWithCodexExec } from "../lib/codex/pulse";
import { generateFocusTasks, syncGoogleConnection } from "../lib/google/sync";
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
import {
  buildDepartmentWebResearchPrompt,
  generateWebInsights,
} from "../lib/webResearch";

type WorkspaceGoalSummary = {
  id: string;
  title: string;
  body: string | null;
  priority: string;
  departmentId: string | null;
};

type PersonalGoalSummary = {
  id: string;
  title: string;
  body: string;
  active: boolean;
  targetWindow: string | null;
};

type PersonalProfileSummary = {
  jobTitle: string | null;
  about: string | null;
} | null;

type TaskSummary = {
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
};

type SourceItemSummary = {
  id: string;
  type: string;
  title: string;
  snippet: string | null;
  contentText: string | null;
  url: string | null;
  occurredAt: Date;
};

export function toJsonCitations(
  citations: Array<{ url: string; title?: string }>,
): Prisma.InputJsonValue {
  return {
    citations: citations
      .map((c) => (c.title ? { url: c.url, title: c.title } : { url: c.url }))
      .slice(0, 6),
  };
}

export function priorityForGoal(priority: string): number {
  if (priority === "HIGH") return 880;
  if (priority === "LOW") return 840;
  return 860;
}

export async function generateLegacyDepartmentWebResearchCards(args: {
  enabled: boolean;
  openaiApiKey: string;
  model: string;
  workspace: { name: string };
  profile: {
    websiteUrl: string | null;
    description: string | null;
    competitorDomains: string[];
  } | null;
  goals: Array<{
    title: string;
    body: string | null;
    priority: string;
    departmentId: string | null;
  }>;
  departments: Array<{
    id: string;
    name: string;
    promptTemplate: string;
    memberships: Array<{ userId: string }>;
  }>;
  onPartialError: (message: string) => void;
}): Promise<
  Map<
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
  >
> {
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

  if (!args.enabled) return deptCardsByDeptId;

  for (const dept of args.departments) {
    const deptMemberIds = dept.memberships.map((m) => m.userId);
    if (deptMemberIds.length === 0) continue;

    const deptGoals = args.goals.filter(
      (g) => g.departmentId === dept.id || !g.departmentId,
    );

    const prompt = buildDepartmentWebResearchPrompt({
      workspaceName: args.workspace.name,
      websiteUrl: args.profile?.websiteUrl,
      description: args.profile?.description,
      competitorDomains: args.profile?.competitorDomains ?? [],
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
        openaiApiKey: args.openaiApiKey,
        model: args.model,
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
      const msg = err instanceof Error ? err.message : String(err);
      args.onPartialError(
        `Web research failed for department ${dept.name}: ${msg}`,
      );
    }
  }

  return deptCardsByDeptId;
}

export async function syncUserConnectorsAndMaybeCodex(args: {
  workspaceId: string;
  workspace: { id: string; name: string; slug: string };
  profile: {
    websiteUrl: string | null;
    description: string | null;
    competitorDomains: string[];
  } | null;
  goals: WorkspaceGoalSummary[];
  personalProfile: PersonalProfileSummary;
  personalGoals: PersonalGoalSummary[];
  tasks: TaskSummary[];
  departments: Array<{
    id: string;
    name: string;
    promptTemplate: string;
    memberships: Array<{ userId: string }>;
  }>;
  userId: string;
  googleConnections: Array<{ id: string; email: string }>;
  githubConnections: Array<{ id: string; login: string }>;
  linearConnections: Array<{ id: string; email?: string | null }>;
  notionConnections: Array<{ id: string; workspaceName?: string | null }>;
  codexAvailable: boolean;
  codexModel: string;
  codexReasoningEffort: "minimal" | "low" | "medium" | "high" | "xhigh";
  codexWebSearchEnabled: boolean;
  editionDate: Date;
  onPartialError: (message: string) => void;
}): Promise<Awaited<
  ReturnType<typeof generatePulseCardsWithCodexExec>
> | null> {
  for (const c of args.googleConnections) {
    try {
      await syncGoogleConnection({
        workspaceId: args.workspaceId,
        userId: args.userId,
        connectionId: c.id,
      });
      await prisma.googleConnection
        .update({ where: { id: c.id }, data: { status: "CONNECTED" } })
        .catch(() => undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      args.onPartialError(`Google sync failed for ${c.email}: ${msg}`);
      await prisma.googleConnection
        .update({ where: { id: c.id }, data: { status: "ERROR" } })
        .catch(() => undefined);
    }
  }

  for (const c of args.githubConnections) {
    try {
      await syncGitHubConnection({
        workspaceId: args.workspaceId,
        userId: args.userId,
        connectionId: c.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      args.onPartialError(`GitHub sync failed for ${c.login}: ${msg}`);
      const status = isGitHubAuthRevoked(err) ? "REVOKED" : "ERROR";
      await prisma.gitHubConnection
        .update({ where: { id: c.id }, data: { status } })
        .catch(() => undefined);
    }
  }

  for (const c of args.linearConnections) {
    try {
      await syncLinearConnection({
        workspaceId: args.workspaceId,
        userId: args.userId,
        connectionId: c.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const label = c.email ? c.email : "viewer";
      args.onPartialError(`Linear sync failed for ${label}: ${msg}`);
      const status = isLinearAuthRevoked(err) ? "REVOKED" : "ERROR";
      await prisma.linearConnection
        .update({ where: { id: c.id }, data: { status } })
        .catch(() => undefined);
    }
  }

  for (const c of args.notionConnections) {
    try {
      await syncNotionConnection({
        workspaceId: args.workspaceId,
        userId: args.userId,
        connectionId: c.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const label = c.workspaceName ? c.workspaceName : "workspace";
      args.onPartialError(`Notion sync failed for ${label}: ${msg}`);
      const status = isNotionAuthRevoked(err) ? "REVOKED" : "ERROR";
      await prisma.notionConnection
        .update({ where: { id: c.id }, data: { status } })
        .catch(() => undefined);
    }
  }

  if (args.googleConnections.length) {
    try {
      await generateFocusTasks({
        workspaceId: args.workspaceId,
        userId: args.userId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      args.onPartialError(`Focus task generation failed: ${msg}`);
    }
  }

  if (!args.codexAvailable) return null;

  try {
    const res = await generatePulseCardsWithCodexExec({
      workspace: args.workspace,
      profile: args.profile,
      goals: args.goals,
      personalProfile: args.personalProfile,
      personalGoals: args.personalGoals,
      tasks: args.tasks,
      departments: args.departments,
      userId: args.userId,
      model: args.codexModel,
      reasoningEffort: args.codexReasoningEffort,
      includeWebResearch: args.codexWebSearchEnabled,
    });

    try {
      await persistCodexMemory({
        workspaceId: args.workspaceId,
        userId: args.userId,
        editionDate: args.editionDate,
        baseMarkdown: res.output.memory.baseMarkdown,
        dailyMarkdown: res.output.memory.dailyMarkdown,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      args.onPartialError(`Codex memory persistence failed: ${msg}`);
    }

    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    args.onPartialError(`Codex pulse generation failed: ${msg}`);
    return null;
  }
}

function compactText(input: string | null | undefined, max = 220): string {
  const cleaned = (input ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function sourceKindLabel(type: string): string {
  if (type.startsWith("GITHUB_")) return "GitHub";
  if (type.startsWith("LINEAR_")) return "Linear";
  if (type.startsWith("NOTION_")) return "Notion";
  if (type.startsWith("DRIVE_")) return "Drive";
  return "Internal";
}

type InternalCardInsert = {
  kind: "INTERNAL";
  departmentId?: string | null;
  title: string;
  body: string;
  why: string;
  action: string;
  sources?: Prisma.InputJsonValue;
  priority: number;
};

export function buildDeterministicFallbackInternalCards(args: {
  minCards: number;
  maxCards: number;
  existingCount: number;
  existingTitles: Set<string>;
  workspaceName: string;
  personalProfile: PersonalProfileSummary;
  personalGoals: PersonalGoalSummary[];
  workspaceGoals: WorkspaceGoalSummary[];
  tasks: TaskSummary[];
  sourceItems: SourceItemSummary[];
}): InternalCardInsert[] {
  const needed = Math.max(0, args.minCards - args.existingCount);
  const maxAdd = Math.max(0, args.maxCards - args.existingCount);
  if (needed === 0 || maxAdd === 0) return [];

  const out: InternalCardInsert[] = [];
  const seen = new Set(
    Array.from(args.existingTitles).map((title) => title.trim().toLowerCase()),
  );

  const pushCard = (card: InternalCardInsert) => {
    if (out.length >= maxAdd) return;
    const key = card.title.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(card);
  };

  const openTasks = args.tasks.filter((task) => task.status === "OPEN");
  for (const task of openTasks.slice(0, 3)) {
    const taskBody = compactText(task.body, 180);
    const sourceLabel = task.sourceItem
      ? ` from ${sourceKindLabel(task.sourceItem.type)}`
      : "";
    const due = task.dueAt
      ? `Due ${task.dueAt.toISOString().slice(0, 10)}.`
      : "";

    pushCard({
      kind: "INTERNAL",
      title: `Task: ${compactText(task.title, 92)}`,
      body: taskBody
        ? `${taskBody}\n${due}`.trim()
        : `Open task${sourceLabel}. ${due}`.trim(),
      why: "Open task in your queue.",
      action: "Close it, snooze it, or break it into one concrete next step.",
      sources:
        task.sourceItem?.url && task.sourceItem.url.startsWith("http")
          ? toJsonCitations([{ url: task.sourceItem.url }])
          : undefined,
      priority: 635 - out.length,
    });
  }

  for (const item of args.sourceItems.slice(0, 4)) {
    const itemBody =
      compactText(item.snippet, 200) || compactText(item.contentText, 200);
    const url =
      typeof item.url === "string" && item.url.startsWith("http")
        ? item.url
        : null;
    pushCard({
      kind: "INTERNAL",
      title: `${sourceKindLabel(item.type)} signal: ${compactText(item.title, 86)}`,
      body: itemBody || "Recent update in your connected tools.",
      why: "Recent internal signal that may change priorities.",
      action: "Review quickly and decide if this needs action today.",
      sources: url ? toJsonCitations([{ url }]) : undefined,
      priority: 620 - out.length,
    });
  }

  for (const goal of args.personalGoals.filter((g) => g.active).slice(0, 2)) {
    const goalBody =
      compactText(goal.body, 190) ||
      (goal.targetWindow
        ? `Time window: ${goal.targetWindow}.`
        : "Keep this outcome explicit in today's priorities.");
    pushCard({
      kind: "INTERNAL",
      title: `Advance personal goal: ${compactText(goal.title, 82)}`,
      body: goalBody,
      why: "Personal goal you defined for this workspace.",
      action: "Choose one meaningful step and schedule it today.",
      priority: 610 - out.length,
    });
  }

  for (const goal of args.workspaceGoals.slice(0, 2)) {
    pushCard({
      kind: "INTERNAL",
      departmentId: goal.departmentId,
      title: `Align with workspace goal: ${compactText(goal.title, 80)}`,
      body:
        compactText(goal.body, 190) ||
        "This is a shared goal for your track in the workspace.",
      why: "Shared alignment context for your team.",
      action: "Tie at least one task today to this team goal.",
      priority: 600 - out.length,
    });
  }

  if (openTasks.length === 0) {
    pushCard({
      kind: "INTERNAL",
      title: "Capture your next 3 tasks",
      body: "Your queue is empty. Add the top three tasks you want to execute next.",
      why: "Task context improves pulse quality and prioritization.",
      action: "Add three concrete tasks in the app.",
      priority: 590 - out.length,
    });
  }

  if (!args.personalProfile?.about && !args.personalProfile?.jobTitle) {
    pushCard({
      kind: "INTERNAL",
      title: "Complete your personal profile",
      body: "Add your role, focus, and context so Starbeam can better tailor your pulse.",
      why: "Personal profile drives user-specific prioritization.",
      action: "Open Profile and add job title + about section.",
      priority: 585 - out.length,
    });
  }

  if (args.personalGoals.length === 0) {
    pushCard({
      kind: "INTERNAL",
      title: "Add one personal goal",
      body: `Write one 1-2 month goal for your work in ${args.workspaceName}.`,
      why: "Goals help Starbeam prioritize signal against outcomes.",
      action: "Open Goals and add one personal goal with context.",
      priority: 580 - out.length,
    });
  }

  if (args.sourceItems.length === 0) {
    pushCard({
      kind: "INTERNAL",
      title: "Connect one integration",
      body: "Link at least one tool (GitHub, Linear, Notion, or Google Drive) to improve internal signal quality.",
      why: "Connected data increases pulse coverage beyond web research.",
      action: "Open Integrations and connect one account.",
      priority: 575 - out.length,
    });
  }

  while (out.length < Math.min(needed, maxAdd)) {
    pushCard({
      kind: "INTERNAL",
      title: `Daily alignment checkpoint ${out.length + 1}`,
      body: "Write one sentence on your highest-priority outcome for today and one blocker to resolve.",
      why: "Fallback card to maintain a consistent minimum pulse size.",
      action: "Capture this in your personal notes or tasks.",
      priority: 560 - out.length,
    });
    if (out.length >= maxAdd) break;
  }

  return out.slice(0, Math.min(needed, maxAdd));
}
