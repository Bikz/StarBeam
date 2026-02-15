import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";
import { isOnboardingV2Enabled } from "@/lib/flags";

function hasText(value: string | null | undefined): boolean {
  return Boolean((value ?? "").trim());
}

export default async function OnboardingEntry({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const { slug } = await params;

  if (!isOnboardingV2Enabled()) {
    redirect(`/w/${slug}/settings`);
  }

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug } },
    include: { workspace: true },
  });
  if (!membership) notFound();

  const base = `/w/${membership.workspace.slug}`;
  if (membership.onboardingCompletedAt) {
    redirect(`${base}/pulse`);
  }

  const [existingPulse, profile, personalGoal] = await Promise.all([
    prisma.pulseEdition.findFirst({
      where: { workspaceId: membership.workspace.id, userId: session.user.id },
      select: { id: true },
    }),
    prisma.workspaceMemberProfile.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: membership.workspace.id,
          userId: session.user.id,
        },
      },
      select: {
        fullName: true,
        location: true,
        jobTitle: true,
        company: true,
        linkedinUrl: true,
        websiteUrl: true,
      },
    }),
    prisma.personalGoal.findFirst({
      where: {
        workspaceId: membership.workspace.id,
        userId: session.user.id,
        active: true,
      },
      select: { id: true },
    }),
  ]);

  if (existingPulse) {
    redirect(`${base}/pulse`);
  }

  if (!hasText(profile?.fullName)) redirect(`${base}/onboarding/name`);
  if (!hasText(profile?.location)) redirect(`${base}/onboarding/location`);
  if (!hasText(profile?.jobTitle)) redirect(`${base}/onboarding/role`);
  if (!hasText(profile?.company)) redirect(`${base}/onboarding/company`);

  const hasPublicProfile =
    hasText(profile?.linkedinUrl) || hasText(profile?.websiteUrl);
  if (!hasPublicProfile) redirect(`${base}/onboarding/profile`);

  if (!personalGoal) redirect(`${base}/onboarding/goals`);

  redirect(`${base}/onboarding/integrations`);
}
