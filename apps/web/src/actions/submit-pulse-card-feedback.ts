"use server";

import { prisma } from "@starbeam/db";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rateLimit";

const Schema = z.object({
  workspaceSlug: z.string().min(1).max(128),
  editionDateIso: z.string().min(10).max(64),
  cardId: z.string().min(1).max(64),
  cardKind: z.string().min(1).max(64),
  cardTitle: z.string().min(0).max(300),
  rating: z.enum(["up", "down"]),
});

export async function submitPulseCardFeedback(input: z.infer<typeof Schema>) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Not signed in");

  const parsed = Schema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid feedback");

  await consumeRateLimit({
    key: `feedback:pulse-card:user:${session.user.id}`,
    windowSec: 60,
    limit: 40,
  });

  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.user.id,
      workspace: { slug: parsed.data.workspaceSlug },
    },
    select: { workspaceId: true },
  });
  if (!membership) throw new Error("Not a member");

  const headerStore = await headers();
  const ua = headerStore.get("user-agent") ?? "";

  const payload = {
    type: "pulse_card_feedback",
    workspaceSlug: parsed.data.workspaceSlug,
    workspaceId: membership.workspaceId,
    editionDateIso: parsed.data.editionDateIso,
    cardId: parsed.data.cardId,
    cardKind: parsed.data.cardKind,
    cardTitle: parsed.data.cardTitle,
    rating: parsed.data.rating,
    userId: session.user.id,
    email: session.user.email ?? null,
    createdAtIso: new Date().toISOString(),
  };

  await prisma.feedback.create({
    data: {
      userId: session.user.id,
      email: session.user.email ?? null,
      message: JSON.stringify(payload),
      source: "pulse-card",
      path: `/w/${parsed.data.workspaceSlug}/pulse`,
      userAgent: ua,
    },
  });
}
