"use server";

import { prisma } from "@starbeam/db";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authOptions } from "@/lib/auth";

const SubmitSchema = z.object({
  message: z.string().min(3).max(4000),
  source: z.string().max(50).optional(),
  path: z.string().max(500).optional(),
  userAgent: z.string().max(500).optional(),
});

export async function submitFeedback(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login?callbackUrl=/feedback");

  const parsed = SubmitSchema.safeParse({
    message: String(formData.get("message") ?? ""),
    source: String(formData.get("source") ?? ""),
    path: String(formData.get("path") ?? ""),
    userAgent: String(formData.get("userAgent") ?? ""),
  });

  if (!parsed.success) redirect("/feedback?error=invalid");

  await prisma.feedback.create({
    data: {
      userId: session.user.id,
      email: session.user.email ?? null,
      message: parsed.data.message,
      source: parsed.data.source ?? "",
      path: parsed.data.path ?? "",
      userAgent: parsed.data.userAgent ?? "",
    },
  });

  redirect("/feedback?sent=1");
}

