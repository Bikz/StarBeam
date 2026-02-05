"use server";

import { prisma } from "@starbeam/db";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authOptions } from "@/lib/auth";

function canManage(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

function normalizeWebsiteUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//i, "");
  s = s.replace(/^www\./i, "");
  s = s.split(/[/?#]/)[0] ?? "";
  if (!s) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) return null;
  return s;
}

const UpsertProfileSchema = z.object({
  websiteUrl: z.string().url().optional(),
  description: z.string().max(1200).optional(),
  competitorDomainsRaw: z.string().max(4000).optional(),
});

export async function upsertWorkspaceProfile(
  workspaceSlug: string,
  formData: FormData,
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug: workspaceSlug } },
    include: { workspace: true },
  });
  if (!membership) throw new Error("Not a member");
  if (!canManage(membership.role)) throw new Error("Managers/Admins only");

  const websiteUrlNormalized = normalizeWebsiteUrl(
    String(formData.get("websiteUrl") ?? ""),
  );

  const parsed = UpsertProfileSchema.safeParse({
    websiteUrl: websiteUrlNormalized ?? undefined,
    description: String(formData.get("description") ?? "").trim() || undefined,
    competitorDomainsRaw:
      String(formData.get("competitorDomains") ?? "").trim() || undefined,
  });
  if (!parsed.success) throw new Error("Invalid profile");

  const competitorDomains =
    parsed.data.competitorDomainsRaw
      ?.split(/[\n,]/g)
      .map((d) => normalizeDomain(d))
      .filter((d): d is string => Boolean(d))
      .slice(0, 25) ?? [];

  await prisma.workspaceProfile.upsert({
    where: { workspaceId: membership.workspace.id },
    update: {
      websiteUrl: parsed.data.websiteUrl ?? null,
      description: parsed.data.description ?? null,
      competitorDomains,
    },
    create: {
      workspaceId: membership.workspace.id,
      websiteUrl: parsed.data.websiteUrl ?? null,
      description: parsed.data.description ?? null,
      competitorDomains,
    },
  });

  redirect(`/w/${workspaceSlug}/profile?saved=1`);
}
