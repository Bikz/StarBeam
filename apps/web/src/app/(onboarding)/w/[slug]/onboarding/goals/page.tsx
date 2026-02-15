import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import OnboardingTextStepForm from "../OnboardingTextStepForm";
import { saveGoal } from "../actions";
import { authOptions } from "@/lib/auth";
import { isOnboardingV2Enabled } from "@/lib/flags";

export default async function OnboardingGoalsStep({
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

  const skipHref = `/w/${membership.workspace.slug}/onboarding/integrations`;

  return (
    <OnboardingTextStepForm
      workspaceSlug={membership.workspace.slug}
      title="What do you want to accomplish right now?"
      description="This becomes part of your personal context for better pulses."
      fieldName="goal"
      label="Your goal"
      placeholder="Ship v1 of our onboarding flow"
      defaultValue=""
      maxLength={160}
      autoComplete="off"
      submitLabel="Continue"
      skipHref={skipHref}
      action={saveGoal}
    />
  );
}
