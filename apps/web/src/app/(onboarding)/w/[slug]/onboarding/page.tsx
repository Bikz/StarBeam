import { redirect } from "next/navigation";

// Backward-compat: old links to the guided onboarding flow now route into Settings.
export default async function OnboardingRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/w/${slug}/settings`);
}
