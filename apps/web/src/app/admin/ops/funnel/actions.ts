"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@starbeam/db";

import { isAdminEmail } from "@/lib/admin";
import { authOptions } from "@/lib/auth";
import { isOpsManualSkillControlEnabled } from "@/lib/flags";
import {
  parseDisabledSkillRefsInput,
  saveInsightManualControls,
} from "@/lib/insightManualControls";

const ProgramTypeSchema = z.enum(["NONE", "DESIGN_PARTNER"]);
const ProgramStatusSchema = z.enum(["NONE", "PROSPECT", "ACTIVE", "CHURNED"]);

const UpdateWorkspaceProgramSchema = z.object({
  workspaceId: z.string().trim().min(1).max(191),
  programType: ProgramTypeSchema,
  programStatus: ProgramStatusSchema,
  programStartedAt: z.string().trim().optional(),
  programEndedAt: z.string().trim().optional(),
  programNotes: z.string().max(4000).optional(),
});

const UpdateManualSkillControlsSchema = z.object({
  discoveredSkillExecutionEnabled: z
    .enum(["on", "off", "true", "false", "1", "0"])
    .optional(),
  disabledSkillRefs: z.string().optional(),
});

function parseDateOnly(value: string | undefined): Date | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export async function updateWorkspaceProgram(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/login");
  }

  const parsed = UpdateWorkspaceProgramSchema.safeParse({
    workspaceId: String(formData.get("workspaceId") ?? ""),
    programType: String(formData.get("programType") ?? "NONE"),
    programStatus: String(formData.get("programStatus") ?? "NONE"),
    programStartedAt: String(formData.get("programStartedAt") ?? ""),
    programEndedAt: String(formData.get("programEndedAt") ?? ""),
    programNotes: String(formData.get("programNotes") ?? ""),
  });

  if (!parsed.success) {
    redirect("/admin/ops/funnel?error=invalid_program");
  }

  const normalizedType =
    parsed.data.programStatus === "NONE" ? "NONE" : parsed.data.programType;
  const normalizedStatus =
    parsed.data.programType === "NONE" ? "NONE" : parsed.data.programStatus;

  await prisma.workspace.update({
    where: { id: parsed.data.workspaceId },
    data: {
      programType: normalizedType,
      programStatus: normalizedStatus,
      programStartedAt:
        normalizedType === "DESIGN_PARTNER"
          ? parseDateOnly(parsed.data.programStartedAt)
          : null,
      programEndedAt:
        normalizedType === "DESIGN_PARTNER"
          ? parseDateOnly(parsed.data.programEndedAt)
          : null,
      programNotes:
        normalizedType === "DESIGN_PARTNER"
          ? (parsed.data.programNotes ?? "").trim()
          : "",
    },
  });

  redirect("/admin/ops/funnel?updated=1");
}

export async function updateInsightManualControls(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/login");
  }
  if (!isOpsManualSkillControlEnabled()) {
    redirect("/admin/ops/funnel?error=manual_controls_disabled");
  }

  const parsed = UpdateManualSkillControlsSchema.safeParse({
    discoveredSkillExecutionEnabled: (() => {
      const raw = String(
        formData.get("discoveredSkillExecutionEnabled") ?? "",
      ).trim();
      return raw.length ? raw : undefined;
    })(),
    disabledSkillRefs: String(formData.get("disabledSkillRefs") ?? ""),
  });
  if (!parsed.success) {
    redirect("/admin/ops/funnel?error=invalid_manual_controls");
  }

  const discoveredSkillExecutionEnabled =
    parsed.data.discoveredSkillExecutionEnabled === "on" ||
    parsed.data.discoveredSkillExecutionEnabled === "true" ||
    parsed.data.discoveredSkillExecutionEnabled === "1";
  const disabledSkillRefs = parseDisabledSkillRefsInput(
    parsed.data.disabledSkillRefs ?? "",
  );

  await saveInsightManualControls({
    discoveredSkillExecutionEnabled,
    disabledSkillRefs,
  });

  redirect("/admin/ops/funnel?updated=1");
}
