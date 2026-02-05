"use server";

import { prisma } from "@starbeam/db";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authOptions } from "@/lib/auth";

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 48);
}

const CreateWorkspaceSchema = z.object({
  name: z.string().min(2).max(64),
});

export async function createOrgWorkspace(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const parsed = CreateWorkspaceSchema.safeParse({
    name: String(formData.get("name") ?? ""),
  });
  if (!parsed.success) {
    throw new Error("Invalid workspace name");
  }

  const baseSlug = slugify(parsed.data.name);
  const fallbackSlug = `org-${session.user.id.slice(0, 8)}`;
  const initialSlug = baseSlug || fallbackSlug;

  let slug = initialSlug;
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.workspace.findUnique({ where: { slug } });
    if (!exists) break;
    slug = `${initialSlug}-${Math.floor(Math.random() * 10000)}`;
  }

  await prisma.workspace.create({
    data: {
      slug,
      name: parsed.data.name,
      type: "ORG",
      createdById: session.user.id,
      memberships: { create: { userId: session.user.id, role: "ADMIN" } },
    },
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
