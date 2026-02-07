import { prisma } from "@starbeam/db";

import { bootstrapWorkspaceWithCodexExec } from "./codex/bootstrap";

function isBlank(value: string | null | undefined): boolean {
  return !value || !value.trim();
}

export async function bootstrapWorkspaceConfigIfNeeded(args: {
  workspaceId: string;
  triggeredByUserId: string;
  codex: {
    available: boolean;
    model: string;
    reasoningEffort: "minimal" | "low" | "medium" | "high" | "xhigh";
    enableWebSearch: boolean;
  };
}): Promise<{
  didBootstrap: boolean;
  wroteProfile: boolean;
  wroteGoals: number;
}> {
  const [workspace, existingProfile, existingGoals, departments] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: args.workspaceId },
      select: { id: true, name: true, slug: true },
    }),
    prisma.workspaceProfile.findUnique({
      where: { workspaceId: args.workspaceId },
      select: { id: true, websiteUrl: true, description: true, competitorDomains: true },
    }),
    prisma.goal.findMany({
      where: { workspaceId: args.workspaceId, active: true },
      select: { id: true, title: true, body: true, priority: true, departmentId: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.department.findMany({
      where: { workspaceId: args.workspaceId, enabled: true },
      select: { id: true, name: true, promptTemplate: true, memberships: { select: { userId: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!workspace) throw new Error("Workspace not found");

  const needsProfile = !existingProfile || isBlank(existingProfile.description);
  const needsGoals = existingGoals.length === 0;
  const needsBootstrap = needsProfile || needsGoals;

  if (!needsBootstrap) {
    return { didBootstrap: false, wroteProfile: false, wroteGoals: 0 };
  }

  if (!args.codex.available) {
    throw new Error("Codex is not available for bootstrap (missing key/binary/disabled).");
  }

  const { output: bootstrap } = await bootstrapWorkspaceWithCodexExec({
    workspace,
    profile: existingProfile
      ? {
          websiteUrl: existingProfile.websiteUrl,
          description: existingProfile.description,
          competitorDomains: existingProfile.competitorDomains,
        }
      : null,
    goals: existingGoals,
    departments,
    userId: args.triggeredByUserId,
    model: args.codex.model,
    reasoningEffort: args.codex.reasoningEffort,
    enableWebSearch: args.codex.enableWebSearch,
  });

  let wroteProfile = false;
  if (!existingProfile) {
    await prisma.workspaceProfile.create({
      data: {
        workspaceId: args.workspaceId,
        websiteUrl: bootstrap.profile.websiteUrl,
        description: bootstrap.profile.description,
        competitorDomains: bootstrap.profile.competitorDomains,
      },
    });
    wroteProfile = true;
  } else {
    const websiteUrl = isBlank(existingProfile.websiteUrl) ? bootstrap.profile.websiteUrl : undefined;
    const description = isBlank(existingProfile.description) ? bootstrap.profile.description : undefined;
    const competitorDomains =
      existingProfile.competitorDomains.length === 0 ? bootstrap.profile.competitorDomains : undefined;

    if (websiteUrl !== undefined || description !== undefined || competitorDomains !== undefined) {
      await prisma.workspaceProfile.update({
        where: { id: existingProfile.id },
        data: { websiteUrl, description, competitorDomains },
      });
      wroteProfile = true;
    }
  }

  let wroteGoals = 0;
  if (existingGoals.length === 0) {
    const goals = bootstrap.goals.slice(0, 5);
    if (goals.length) {
      await prisma.goal.createMany({
        data: goals.map((g) => ({
          workspaceId: args.workspaceId,
          authorUserId: args.triggeredByUserId,
          title: g.title,
          body: g.body ?? "",
          priority: g.priority,
          active: true,
        })),
      });
      wroteGoals = goals.length;
    }
  }

  return { didBootstrap: true, wroteProfile, wroteGoals };
}
