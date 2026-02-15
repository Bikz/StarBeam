"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@starbeam/db";

import { isAdminEmail } from "@/lib/admin";
import { authOptions } from "@/lib/auth";

const FeedbackCategorySchema = z.enum([
  "NOISE",
  "MISSING_CONTEXT",
  "WRONG_PRIORITY",
  "LOW_CONFIDENCE",
  "OTHER",
]);

const FeedbackTriageStatusSchema = z.enum([
  "NEW",
  "REVIEWED",
  "ACTIONED",
  "WONT_FIX",
]);

const UpdateFeedbackTriageSchema = z.object({
  feedbackId: z.string().trim().min(1).max(191),
  category: z.union([FeedbackCategorySchema, z.literal("")]),
  triageStatus: FeedbackTriageStatusSchema,
  triageNote: z.string().max(4000).optional(),
});

export async function updateFeedbackTriage(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (
    !session?.user?.id ||
    !session.user.email ||
    !isAdminEmail(session.user.email)
  ) {
    redirect("/login");
  }

  const parsed = UpdateFeedbackTriageSchema.safeParse({
    feedbackId: String(formData.get("feedbackId") ?? ""),
    category: String(formData.get("category") ?? ""),
    triageStatus: String(formData.get("triageStatus") ?? "NEW"),
    triageNote: String(formData.get("triageNote") ?? ""),
  });

  if (!parsed.success) {
    redirect("/admin/feedback?error=invalid_triage");
  }

  const category = parsed.data.category === "" ? null : parsed.data.category;
  const triageNote = (parsed.data.triageNote ?? "").trim();

  const resetToNew =
    parsed.data.triageStatus === "NEW" && !category && triageNote.length === 0;

  await prisma.feedback.update({
    where: { id: parsed.data.feedbackId },
    data: resetToNew
      ? {
          category: null,
          triageStatus: "NEW",
          triageNote: "",
          triagedAt: null,
          triagedByUserId: null,
        }
      : {
          category,
          triageStatus: parsed.data.triageStatus,
          triageNote,
          triagedAt: new Date(),
          triagedByUserId: session.user.id,
        },
  });

  redirect("/admin/feedback?updated=1");
}
