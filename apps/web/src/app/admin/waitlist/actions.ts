"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

const GrantSchema = z.object({
  userId: z.string().min(1).max(64),
});

export async function grantBetaAccess(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/login");
  }

  const parsed = GrantSchema.safeParse({
    userId: String(formData.get("userId") ?? ""),
  });
  if (!parsed.success) redirect("/admin/waitlist?error=invalid");

  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: { betaAccessGrantedAt: new Date() },
  });

  redirect("/admin/waitlist?granted=1");
}

export async function revokeBetaAccess(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/login");
  }

  const parsed = GrantSchema.safeParse({
    userId: String(formData.get("userId") ?? ""),
  });
  if (!parsed.success) redirect("/admin/waitlist?error=invalid");

  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: { betaAccessGrantedAt: null },
  });

  redirect("/admin/waitlist?revoked=1");
}
