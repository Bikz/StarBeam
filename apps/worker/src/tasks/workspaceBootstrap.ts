import { prisma } from "@starbeam/db";
import { z } from "zod";

const WorkspaceBootstrapPayloadSchema = z.object({
  workspaceId: z.string().min(1),
  jobRunId: z.string().min(1),
});

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
    // TODO: Implement Codex-powered bootstrap of WorkspaceProfile + starter Goals.
    // For now, keep job plumbing + UI stable while we iterate on prompt quality.
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: { status: "SUCCEEDED", finishedAt: new Date() },
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

