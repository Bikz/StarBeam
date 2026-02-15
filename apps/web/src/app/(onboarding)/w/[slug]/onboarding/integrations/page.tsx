import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import { startGoogleConnect } from "@/app/(portal)/w/[slug]/integrations/googleActions";
import { authOptions } from "@/lib/auth";
import { isOnboardingV2Enabled } from "@/lib/flags";

function hasGoogleAuthEnv(): boolean {
  return (
    typeof process.env.GOOGLE_CLIENT_ID === "string" &&
    process.env.GOOGLE_CLIENT_ID.length > 0 &&
    typeof process.env.GOOGLE_CLIENT_SECRET === "string" &&
    process.env.GOOGLE_CLIENT_SECRET.length > 0
  );
}

export default async function OnboardingIntegrationsStep({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  if (!isOnboardingV2Enabled()) redirect(`/w/${slug}/settings`);

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug } },
    include: { workspace: true },
  });
  if (!membership) notFound();
  if (membership.onboardingCompletedAt) {
    redirect(`/w/${membership.workspace.slug}/pulse`);
  }

  const googleCount = await prisma.googleConnection.count({
    where: {
      workspaceId: membership.workspace.id,
      ownerUserId: session.user.id,
      status: "CONNECTED",
    },
  });
  const googleConnected = googleCount > 0;

  const base = `/w/${membership.workspace.slug}`;
  const nextSelf = `${base}/onboarding/integrations`;

  return (
    <section className="sb-card p-7">
      <div>
        <h1 className="sb-title text-2xl font-extrabold">
          Connect an integration (optional)
        </h1>
        <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
          Integrations give Starbeam signal to build better pulses. You can also
          connect later.
        </p>
      </div>

      {sp.connected === "google" ? (
        <div className="mt-5 sb-alert" role="status" aria-live="polite">
          Google connected.
        </div>
      ) : null}
      {sp.error ? (
        <div className="mt-5 sb-alert" role="status" aria-live="polite">
          <strong>Couldn&apos;t connect Google.</strong>{" "}
          <span className="text-[color:var(--sb-muted)]">
            Please try again.
          </span>
        </div>
      ) : null}

      <div className="mt-7 sb-card-inset p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
              Google
            </div>
            <div className="mt-1 sb-title text-base font-extrabold">
              Gmail, Calendar, Drive
            </div>
            <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
              Status:{" "}
              <span className="font-semibold text-[color:var(--sb-fg)]">
                {googleConnected ? "connected" : "not connected"}
              </span>
            </div>
          </div>

          <form
            action={startGoogleConnect.bind(
              null,
              membership.workspace.slug,
              nextSelf,
            )}
          >
            <button
              type="submit"
              className={sbButtonClass({
                variant: googleConnected ? "secondary" : "primary",
                className: "h-11 px-5 text-sm font-extrabold",
              })}
              disabled={!hasGoogleAuthEnv()}
              title={
                !hasGoogleAuthEnv() ? "Google OAuth not configured" : undefined
              }
            >
              {googleConnected ? "Reconnect" : "Connect Google"}
            </button>
          </form>
        </div>

        {!hasGoogleAuthEnv() ? (
          <div className="mt-3 text-xs text-[color:var(--sb-muted)]">
            Google OAuth is not configured in this environment.
          </div>
        ) : null}

        <div className="mt-4 text-xs text-[color:var(--sb-muted)] leading-relaxed">
          Starbeam requests read-only access and stores tokens encrypted. Raw
          contents are not logged.
        </div>

        <div className="mt-4">
          <Link
            href={`${base}/integrations`}
            className="text-xs font-semibold text-[color:var(--sb-muted)] hover:text-[color:var(--sb-fg)] hover:underline"
          >
            See all integrations
          </Link>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-black/10 dark:border-white/10 bg-[color:var(--sb-bg0)]/95 backdrop-blur">
        <div className="sb-container py-4 grid grid-cols-3 items-center gap-3">
          <div className="justify-self-start">
            <Link
              href={`${base}/onboarding/macos`}
              className={sbButtonClass({
                variant: "secondary",
                className: "h-11 px-5 text-sm font-semibold",
              })}
            >
              Skip for now
            </Link>
          </div>

          <div className="justify-self-center">
            <Link
              href={`${base}/onboarding/macos`}
              className={sbButtonClass({
                variant: "primary",
                className: "h-11 px-8 text-sm font-extrabold",
              })}
            >
              Continue
            </Link>
          </div>

          <div />
        </div>
      </div>
    </section>
  );
}
