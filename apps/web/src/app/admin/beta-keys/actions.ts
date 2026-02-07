"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";
import { generateBetaKeyCode, hashBetaKey } from "@/lib/betaKeys";
import { isAdminEmail } from "@/lib/admin";

const CreateSchema = z.object({
  label: z.string().max(120).optional(),
  maxUses: z.coerce.number().int().min(1).max(100000).default(100),
  validDays: z.coerce.number().int().min(0).max(365).default(0),
});

export async function createBetaKey(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/login");
  }

  const parsed = CreateSchema.safeParse({
    label: String(formData.get("label") ?? ""),
    maxUses: formData.get("maxUses"),
    validDays: formData.get("validDays"),
  });
  if (!parsed.success) redirect("/admin/beta-keys?error=invalid");

  const code = generateBetaKeyCode();
  const codeHash = hashBetaKey(code);
  const now = new Date();
  const expiresAt =
    parsed.data.validDays > 0
      ? new Date(now.getTime() + parsed.data.validDays * 24 * 60 * 60 * 1000)
      : null;

  await prisma.betaKey.create({
    data: {
      codeHash,
      label: parsed.data.label ?? "",
      maxUses: parsed.data.maxUses,
      expiresAt,
    },
  });

  redirect(`/admin/beta-keys?created=${encodeURIComponent(code)}`);
}

export async function disableBetaKey(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/login");
  }

  await prisma.betaKey.update({
    where: { id },
    data: { disabledAt: new Date() },
  });

  redirect("/admin/beta-keys?disabled=1");
}

