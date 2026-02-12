"use server";

import { getServerSession } from "next-auth";
import { z } from "zod";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";
import { recordUsageEventSafe } from "@/lib/usageEvents";

const RecordPulseViewSchema = z.object({
  workspaceSlug: z.string().trim().min(1).max(80),
  editionDateIso: z.string().trim().min(1).max(64),
  cardCount: z.number().int().min(0).max(200).optional(),
});

export async function recordPulseViewed(input: {
  workspaceSlug: string;
  editionDateIso: string;
  cardCount?: number;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return;

  const parsed = RecordPulseViewSchema.safeParse(input);
  if (!parsed.success) return;

  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.user.id,
      workspace: { slug: parsed.data.workspaceSlug },
    },
    select: { workspaceId: true },
  });
  if (!membership) return;

  await recordUsageEventSafe({
    eventType: "PULSE_VIEWED_WEB",
    source: "web",
    workspaceId: membership.workspaceId,
    userId: session.user.id,
    metadata: {
      workspaceSlug: parsed.data.workspaceSlug,
      editionDateIso: parsed.data.editionDateIso,
      cardCount: parsed.data.cardCount ?? null,
    },
  });
}
