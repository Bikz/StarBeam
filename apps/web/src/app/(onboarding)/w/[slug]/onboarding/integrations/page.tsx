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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="sb-title text-2xl font-extrabold">
            Bring your sources into Starbeam
          </h1>
          <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            When you connect sources, Starbeam can generate stronger pulses with
            less manual setup. You can skip this and connect later.
          </p>
        </div>

        <div className="sb-pill inline-flex items-center gap-2">
          <span
            className={[
              "h-2 w-2 rounded-full",
              googleConnected
                ? "bg-emerald-400"
                : "bg-black/20 dark:bg-white/25",
            ].join(" ")}
            aria-hidden="true"
          />
          <span className="text-xs font-semibold">
            {googleConnected ? "Auto-sync on" : "Auto-sync off"}
          </span>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3 overflow-x-auto pb-1">
        <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
          Sources
        </div>
        <div aria-hidden="true" className="flex items-center gap-3">
          <div className="h-px w-10 bg-black/10 dark:bg-white/10" />
          <div className="flex items-center gap-2">
            {[
              { label: "Google", short: "G" },
              { label: "Notion", short: "N" },
              { label: "GitHub", short: "GH" },
              { label: "Linear", short: "L" },
            ].map((app) => (
              <div
                key={app.label}
                className="h-9 w-9 shrink-0 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 grid place-items-center text-xs font-extrabold text-[color:var(--sb-fg)]"
                title={app.label}
              >
                {app.short}
              </div>
            ))}
          </div>
          <div className="h-px w-10 bg-black/10 dark:bg-white/10" />
          <div
            className="h-9 w-9 shrink-0 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 grid place-items-center"
            title="Starbeam"
          >
            <div className="h-2.5 w-2.5 rounded-full bg-black/60 dark:bg-white/80" />
          </div>
        </div>
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

      <div className="mt-7 grid gap-3 md:grid-cols-2">
        <div className="sb-card-inset p-5 flex flex-col justify-between gap-5">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                Google
              </div>
              <div className="text-xs text-[color:var(--sb-muted)]">
                <span
                  className={[
                    "inline-block align-middle h-2 w-2 rounded-full",
                    googleConnected
                      ? "bg-emerald-400"
                      : "bg-black/20 dark:bg-white/25",
                  ].join(" ")}
                  aria-hidden="true"
                />{" "}
                <span className="align-middle">
                  {googleConnected ? "Connected" : "Not connected"}
                </span>
              </div>
            </div>

            <div className="mt-1 sb-title text-base font-extrabold">
              Gmail, Calendar, Drive
            </div>
            <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
              Pull email, meetings, and docs into your pulse. Starbeam requests
              read-only access and stores tokens encrypted.
            </div>

            <div className="mt-4 grid gap-2 text-xs text-[color:var(--sb-muted)]">
              <div className="flex items-center justify-between gap-3">
                <div>Signal</div>
                <div className="font-semibold text-[color:var(--sb-fg)]">
                  email, meetings, docs
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>First sync</div>
                <div className="font-semibold text-[color:var(--sb-fg)]">
                  {googleConnected
                    ? "runs automatically"
                    : "starts after you connect"}
                </div>
              </div>
            </div>

            {!hasGoogleAuthEnv() ? (
              <div className="mt-4 text-xs text-[color:var(--sb-muted)]">
                Google OAuth is not configured in this environment.
              </div>
            ) : null}
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
                className: "h-11 px-5 text-sm font-extrabold w-full",
              })}
              disabled={!hasGoogleAuthEnv()}
              title={
                !hasGoogleAuthEnv() ? "Google OAuth not configured" : undefined
              }
            >
              {googleConnected ? "Reconnect Google" : "Connect Google"}
            </button>
          </form>
        </div>

        <div className="sb-card-inset p-5 flex flex-col justify-between gap-5">
          <div>
            <div className="text-xs font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
              More sources
            </div>
            <div className="mt-1 sb-title text-base font-extrabold">
              Notion, GitHub, Linear
            </div>
            <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
              Add more tools anytime. Some sources use tokens instead of OAuth,
              so they live in Settings.
            </div>

            <div className="mt-4 flex items-center gap-2" aria-hidden="true">
              {[
                { label: "Notion", short: "N" },
                { label: "GitHub", short: "GH" },
                { label: "Linear", short: "L" },
              ].map((app) => (
                <div
                  key={app.label}
                  className="h-9 w-9 shrink-0 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 grid place-items-center text-xs font-extrabold text-[color:var(--sb-fg)]"
                  title={app.label}
                >
                  {app.short}
                </div>
              ))}
            </div>

            <div className="mt-4 text-xs text-[color:var(--sb-muted)] leading-relaxed">
              You can disconnect anytime. Starbeam doesn’t log raw contents.
            </div>
          </div>

          <Link
            href={`${base}/integrations`}
            target="_blank"
            rel="noreferrer"
            className={sbButtonClass({
              variant: "secondary",
              className: "h-11 px-5 text-sm font-extrabold w-full",
            })}
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
