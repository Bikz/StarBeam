import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";
import { isOnboardingV2Enabled } from "@/lib/flags";

// `/w/:slug` is intentionally a thin redirect so Pulse is always the primary object.
export default async function WorkspaceHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const { slug } = await params;

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug } },
    include: { workspace: true },
  });
  if (!membership) notFound();

  const base = `/w/${membership.workspace.slug}`;
  const onboardingV2 = isOnboardingV2Enabled();

  if (!onboardingV2) {
    redirect(`${base}/pulse`);
  }

  const existingPulse = await prisma.pulseEdition.findFirst({
    where: { workspaceId: membership.workspace.id, userId: session.user.id },
    select: { id: true },
  });

  if (existingPulse) {
    redirect(`${base}/pulse`);
  }

  if (!membership.onboardingCompletedAt) {
    redirect(`${base}/onboarding`);
  }

  redirect(`${base}/pulse`);
}
