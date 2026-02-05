"use server";

import crypto from "node:crypto";

import { prisma } from "@starbeam/db";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authOptions } from "@/lib/auth";

const CreateInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["MANAGER", "MEMBER"]),
});

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function createInvite(workspaceSlug: string, formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug: workspaceSlug } },
    include: { workspace: true },
  });
  if (!membership) throw new Error("Not a member");
  if (membership.role !== "ADMIN") throw new Error("Admins only");

  const parsed = CreateInviteSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? "MEMBER"),
  });
  if (!parsed.success) throw new Error("Invalid invite");

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.invite.create({
    data: {
      workspaceId: membership.workspace.id,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      tokenHash,
      expiresAt,
    },
  });

  redirect(`/w/${workspaceSlug}/members?invite=${encodeURIComponent(token)}`);
}

