import type { Prisma } from "@starbeam/db";
import { prisma } from "@starbeam/db";

import { persistCodexMemory } from "../lib/codex/memory";
import { generatePulseCardsWithCodexExec } from "../lib/codex/pulse";
import { generateFocusTasks, syncGoogleConnection } from "../lib/google/sync";
import { isAuthRevoked as isGitHubAuthRevoked, syncGitHubConnection } from "../lib/integrations/github";
import { isAuthRevoked as isLinearAuthRevoked, syncLinearConnection } from "../lib/integrations/linear";
import { isAuthRevoked as isNotionAuthRevoked, syncNotionConnection } from "../lib/integrations/notion";
import { buildDepartmentWebResearchPrompt, generateWebInsights } from "../lib/webResearch";

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
  profile: { websiteUrl: string | null; description: string | null; competitorDomains: string[] } | null;
  goals: Array<{ title: string; body: string | null; priority: string; departmentId: string | null }>;
  departments: Array<{ id: string; name: string; promptTemplate: string; memberships: Array<{ userId: string }> }>;
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
      args.onPartialError(`Web research failed for department ${dept.name}: ${msg}`);
    }
  }

  return deptCardsByDeptId;
}

export async function syncUserConnectorsAndMaybeCodex(args: {
  workspaceId: string;
  workspace: { id: string; name: string; slug: string };
  profile: { websiteUrl: string | null; description: string | null; competitorDomains: string[] } | null;
  goals: Array<{ id: string; title: string; body: string | null; priority: string; departmentId: string | null }>;
  departments: Array<{ id: string; name: string; promptTemplate: string; memberships: Array<{ userId: string }> }>;
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
}): Promise<
  | Awaited<ReturnType<typeof generatePulseCardsWithCodexExec>>
  | null
> {
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
      await syncGitHubConnection({ workspaceId: args.workspaceId, userId: args.userId, connectionId: c.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      args.onPartialError(`GitHub sync failed for ${c.login}: ${msg}`);
      const status = isGitHubAuthRevoked(err) ? "REVOKED" : "ERROR";
      await prisma.gitHubConnection.update({ where: { id: c.id }, data: { status } }).catch(() => undefined);
    }
  }

  for (const c of args.linearConnections) {
    try {
      await syncLinearConnection({ workspaceId: args.workspaceId, userId: args.userId, connectionId: c.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const label = c.email ? c.email : "viewer";
      args.onPartialError(`Linear sync failed for ${label}: ${msg}`);
      const status = isLinearAuthRevoked(err) ? "REVOKED" : "ERROR";
      await prisma.linearConnection.update({ where: { id: c.id }, data: { status } }).catch(() => undefined);
    }
  }

  for (const c of args.notionConnections) {
    try {
      await syncNotionConnection({ workspaceId: args.workspaceId, userId: args.userId, connectionId: c.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const label = c.workspaceName ? c.workspaceName : "workspace";
      args.onPartialError(`Notion sync failed for ${label}: ${msg}`);
      const status = isNotionAuthRevoked(err) ? "REVOKED" : "ERROR";
      await prisma.notionConnection.update({ where: { id: c.id }, data: { status } }).catch(() => undefined);
    }
  }

  if (args.googleConnections.length) {
    try {
      await generateFocusTasks({ workspaceId: args.workspaceId, userId: args.userId });
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
