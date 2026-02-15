import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import OnboardingTextStepForm from "../OnboardingTextStepForm";
import { saveName } from "../actions";
import { authOptions } from "@/lib/auth";
import { isOnboardingV2Enabled } from "@/lib/flags";

export default async function OnboardingNameStep({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const { slug } = await params;
  if (!isOnboardingV2Enabled()) redirect(`/w/${slug}/settings`);

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug } },
    include: { workspace: true },
  });
  if (!membership) notFound();
  if (membership.onboardingCompletedAt) {
    redirect(`/w/${membership.workspace.slug}/pulse`);
  }

  const [user, profile] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true },
    }),
    prisma.workspaceMemberProfile.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: membership.workspace.id,
          userId: session.user.id,
        },
      },
      select: { fullName: true },
    }),
  ]);

  const defaultValue = (profile?.fullName ?? user?.name ?? "").trim();

  return (
    <OnboardingTextStepForm
      workspaceSlug={membership.workspace.slug}
      title="Let's get started. What's your name?"
      description="This helps Starbeam personalize your pulse."
      fieldName="fullName"
      label="Full name"
      placeholder="Your name"
      defaultValue={defaultValue}
      maxLength={120}
      autoComplete="name"
      action={saveName}
    />
  );
}
