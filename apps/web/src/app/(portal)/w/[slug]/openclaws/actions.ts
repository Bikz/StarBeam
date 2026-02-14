"use server";

import crypto from "node:crypto";

import { prisma } from "@starbeam/db";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { sha256Hex } from "@/lib/apiTokens";
import { webOrigin } from "@/lib/webOrigin";

const OPENCLAW_STARBEAM_PLUGIN_SPEC = "github:Bikz/openclaw-starbeam#v0.1.0";

const CreateOpenClawSchema = z.object({
  name: z.string().trim().min(1).max(80),
  mode: z.enum(["BRIEF", "AUTOPILOT"]).default("BRIEF"),
  roleTitle: z.string().trim().max(80).optional(),
  responsibilities: z.string().trim().max(4000).optional(),
});

const UpdateOpenClawSchema = z.object({
  name: z.string().trim().min(1).max(80),
  mode: z.enum(["BRIEF", "AUTOPILOT"]).default("BRIEF"),
  roleTitle: z.string().trim().max(80).optional(),
  responsibilities: z.string().trim().max(4000).optional(),
});

const QueueCommandSchema = z.object({
  message: z.string().trim().min(1).max(8000),
});

async function requireMembership(args: {
  userId: string;
  workspaceSlug: string;
}) {
  const membership = await prisma.membership.findFirst({
    where: { userId: args.userId, workspace: { slug: args.workspaceSlug } },
    include: { workspace: true },
  });
  if (!membership) throw new Error("Not a member");
  return membership;
}

export async function createOpenClawAgent(
  workspaceSlug: string,
  formData: FormData,
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const membership = await requireMembership({
    userId: session.user.id,
    workspaceSlug,
  });

  const parsed = CreateOpenClawSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    mode: String(formData.get("mode") ?? "BRIEF"),
    roleTitle: String(formData.get("roleTitle") ?? ""),
    responsibilities: String(formData.get("responsibilities") ?? ""),
  });
  if (!parsed.success) throw new Error("Invalid OpenClaw");

  await prisma.openClawAgent.create({
    data: {
      workspaceId: membership.workspace.id,
      createdByUserId: session.user.id,
      name: parsed.data.name,
      mode: parsed.data.mode,
      roleTitle: parsed.data.roleTitle || null,
      responsibilities: parsed.data.responsibilities || null,
      status: "OFFLINE",
    },
    select: { id: true },
  });

  redirect(`/w/${workspaceSlug}/openclaws`);
}

export async function updateOpenClawAgent(
  workspaceSlug: string,
  openclawAgentId: string,
  formData: FormData,
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const membership = await requireMembership({
    userId: session.user.id,
    workspaceSlug,
  });

  const parsed = UpdateOpenClawSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    mode: String(formData.get("mode") ?? "BRIEF"),
    roleTitle: String(formData.get("roleTitle") ?? ""),
    responsibilities: String(formData.get("responsibilities") ?? ""),
  });
  if (!parsed.success) throw new Error("Invalid OpenClaw update");

  await prisma.openClawAgent.updateMany({
    where: {
      id: openclawAgentId,
      workspaceId: membership.workspace.id,
      createdByUserId: session.user.id,
    },
    data: {
      name: parsed.data.name,
      mode: parsed.data.mode,
      roleTitle: parsed.data.roleTitle || null,
      responsibilities: parsed.data.responsibilities || null,
    },
  });

  redirect(`/w/${workspaceSlug}/openclaws`);
}

export async function deleteOpenClawAgent(
  workspaceSlug: string,
  openclawAgentId: string,
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const membership = await requireMembership({
    userId: session.user.id,
    workspaceSlug,
  });

  const deleted = await prisma.openClawAgent.deleteMany({
    where: {
      id: openclawAgentId,
      workspaceId: membership.workspace.id,
      createdByUserId: session.user.id,
    },
  });
  if (deleted.count !== 1) throw new Error("OpenClaw not found");

  redirect(`/w/${workspaceSlug}/openclaws`);
}

export async function queueOpenClawCommand(
  workspaceSlug: string,
  openclawAgentId: string,
  formData: FormData,
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const membership = await requireMembership({
    userId: session.user.id,
    workspaceSlug,
  });

  const parsed = QueueCommandSchema.safeParse({
    message: String(formData.get("message") ?? ""),
  });
  if (!parsed.success) throw new Error("Message required");

  const agent = await prisma.openClawAgent.findFirst({
    where: {
      id: openclawAgentId,
      workspaceId: membership.workspace.id,
      createdByUserId: session.user.id,
    },
    select: { id: true, mode: true },
  });
  if (!agent) throw new Error("OpenClaw not found");

  const type = agent.mode === "AUTOPILOT" ? "RUN_TASK" : "DELIVER_BRIEF";

  await prisma.openClawCommand.create({
    data: {
      openclawAgentId: agent.id,
      type,
      state: "PENDING",
      payload: {
        message: parsed.data.message,
        issuedByUserId: session.user.id,
      },
    },
    select: { id: true },
  });

  redirect(`/w/${workspaceSlug}/openclaws`);
}

export async function generateOpenClawSetupPrompt(
  workspaceSlug: string,
  openclawAgentId: string,
): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const membership = await requireMembership({
    userId: session.user.id,
    workspaceSlug,
  });

  const agent = await prisma.openClawAgent.findFirst({
    where: {
      id: openclawAgentId,
      workspaceId: membership.workspace.id,
      createdByUserId: session.user.id,
    },
    select: { id: true, name: true, roleTitle: true, responsibilities: true },
  });
  if (!agent) throw new Error("OpenClaw not found");

  const deviceCode = crypto.randomBytes(16).toString("hex");
  const deviceCodeHash = sha256Hex(deviceCode);
  const now = new Date();
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000);

  await prisma.deviceAuthRequest.create({
    data: {
      deviceCodeHash,
      status: "APPROVED",
      clientKind: "OPENCLAW",
      workspaceId: membership.workspace.id,
      openclawAgentId: agent.id,
      approvedUserId: session.user.id,
      approvedAt: now,
      expiresAt,
    },
    select: { id: true },
  });

  const setupUrl = `${webOrigin()}/openclaw/setup?code=${encodeURIComponent(deviceCode)}`;
  const roleTitle = agent.roleTitle?.trim() || "unspecified";
  const responsibilities = agent.responsibilities?.trim() || "unspecified";

  return [
    "You are OpenClaw.",
    "",
    "Connect this OpenClaw instance to Starbeam so Starbeam can queue briefs/tasks for you.",
    "Treat the setup code as a secret (never share it).",
    "",
    `Starbeam setup link: ${setupUrl}`,
    `Setup code (secret): ${deviceCode}`,
    "",
    "Steps:",
    "0) Ensure the Starbeam plugin is installed in this OpenClaw instance. If /starbeam is unknown, run:",
    `   openclaw plugins install ${OPENCLAW_STARBEAM_PLUGIN_SPEC}`,
    "   Then restart the OpenClaw gateway, and verify /starbeam exists.",
    "1) Open the Starbeam setup link above in a browser and read it end-to-end.",
    "2) In the chat where you want to control this OpenClaw, run:",
    `   /starbeam connect ${setupUrl}`,
    "3) Then run:",
    "   /starbeam status",
    "",
    "Memory to store (important):",
    `- Starbeam workspace: ${membership.workspace.name} (${membership.workspace.slug})`,
    `- This OpenClaw's Starbeam name: ${agent.name}`,
    `- Role: ${roleTitle}`,
    `- Responsibilities: ${responsibilities}`,
    "- Starbeam is my upstream task queue.",
    "- When Starbeam sends a BRIEF: store it for context; do not ask follow-ups unless needed.",
    "- When Starbeam sends an AUTOPILOT TASK: execute it, then report completion status.",
    "",
    "Installation notes:",
    `- Plugin spec: ${OPENCLAW_STARBEAM_PLUGIN_SPEC}`,
    "- After installing/updating plugins, you typically need to restart the gateway for commands to register.",
  ].join("\n");
}
