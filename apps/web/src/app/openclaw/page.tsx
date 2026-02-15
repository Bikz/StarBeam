import { sbButtonClass } from "@starbeam/shared";
import type { Metadata } from "next";
import Link from "next/link";

import {
  OPENCLAW_STARBEAM_PLUGIN_INSTALL_SNIPPET,
  OPENCLAW_STARBEAM_PLUGIN_SPEC,
} from "@/lib/openclawStarbeamPlugin";
import { webOrigin } from "@/lib/webOrigin";

const title = "Starbeam x OpenClaw | Memory, Execution, Orchestration";
const description =
  "Connect your OpenClaw instance to Starbeam for agent memory support, reliable task execution, and multi-agent orchestration. Install the Starbeam OpenClaw plugin and start receiving briefs and commands.";

export const metadata: Metadata = {
  metadataBase: new URL(webOrigin()),
  title,
  description,
  alternates: { canonical: "/openclaw" },
  keywords: [
    "openclaw",
    "open claw",
    "openclaw memory",
    "open claw memory",
    "openclaw execution",
    "open claw execution",
    "openclaw orchestration",
    "open claw orchestration",
    "agent gateway",
    "agent execution",
    "agent orchestration",
    "ai agent orchestration",
    "starbeam openclaw plugin",
  ],
  openGraph: {
    title,
    description,
    url: "/openclaw",
    siteName: "Starbeam",
    images: [
      {
        url: "/og/og.png",
        width: 1200,
        height: 630,
        alt: "Starbeam x OpenClaw",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og/og.png"],
  },
};

export default function OpenClawLandingPage() {
  const setupUrl = `${webOrigin()}/openclaw/setup`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is Starbeam x OpenClaw?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Starbeam is a gateway layer that lets you connect one or more OpenClaw instances to a Starbeam workspace. Starbeam can queue briefs and tasks to OpenClaw and record completion signals back in Starbeam.",
        },
      },
      {
        "@type": "Question",
        name: "Does this support OpenClaw memory?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "In v1, Starbeam sends structured briefs and tasks to OpenClaw and captures what happened (results, completion, dismissal). If you use OpenClaw memory to persist context, Starbeam helps by delivering consistent inputs and tracking outcomes over time.",
        },
      },
      {
        "@type": "Question",
        name: "Does this support OpenClaw execution and orchestration?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Starbeam can queue work to OpenClaw (execution) and you can attach multiple OpenClaw instances with different roles (orchestration). Each instance polls Starbeam for commands and posts events back.",
        },
      },
    ],
  };

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="sb-card p-8">
          <div className="inline-flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
            <span className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-3 py-1">
              OpenClaw memory
            </span>
            <span className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-3 py-1">
              OpenClaw execution
            </span>
            <span className="rounded-full border border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/10 px-3 py-1">
              OpenClaw orchestration
            </span>
          </div>

          <h1 className="mt-5 sb-title text-3xl sm:text-4xl font-extrabold leading-tight">
            Starbeam x OpenClaw
          </h1>
          <p className="mt-3 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            If you run OpenClaw on a Mac mini or VM and want a clean way to feed
            it structured work, Starbeam gives you a lightweight gateway: queue
            briefs and tasks, track what got done, and coordinate multiple
            OpenClaw instances by role.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Link
              href="/login"
              className={sbButtonClass({
                variant: "primary",
                className: "h-11 px-5 text-sm font-semibold justify-center",
              })}
            >
              Open Starbeam
            </Link>
            <Link
              href="/openclaw/setup"
              className={sbButtonClass({
                variant: "secondary",
                className: "h-11 px-5 text-sm font-semibold justify-center",
              })}
            >
              OpenClaw setup page
            </Link>
          </div>

          <div className="mt-10 sb-card-inset p-5">
            <div className="text-xs font-extrabold sb-title">
              Quick start (v1)
            </div>
            <ol className="mt-3 grid gap-2 text-sm text-[color:var(--sb-muted)] leading-relaxed list-decimal pl-5">
              <li>
                In Starbeam, go to <span className="font-semibold">OpenClaws</span>{" "}
                and click <span className="font-semibold">Copy OpenClaw setup prompt</span>.
              </li>
              <li>
                Paste that prompt into your OpenClaw control chat. If{" "}
                <span className="font-mono">/starbeam</span> is unknown, install
                the external plugin and restart OpenClaw:
                <div className="mt-2 font-mono text-xs sb-card-inset p-3 text-[color:var(--sb-fg)] break-all">
                  {OPENCLAW_STARBEAM_PLUGIN_INSTALL_SNIPPET}
                </div>
              </li>
              <li>
                Connect OpenClaw to Starbeam using the setup link/code from the
                prompt, then verify status:
                <div className="mt-2 font-mono text-xs sb-card-inset p-3 text-[color:var(--sb-fg)] break-all">
                  {`/starbeam connect ${setupUrl}?code=<setup-code>`}
                  <br />
                  {"/starbeam status"}
                </div>
              </li>
            </ol>
          </div>

          <div className="mt-10 grid gap-6">
            <section>
              <h2 className="sb-title text-xl font-extrabold">
                OpenClaw memory (v1)
              </h2>
              <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                People often search for &quot;OpenClaw memory&quot; when they
                want an agent to remember context and stay consistent over time.
                In v1, Starbeam sends your OpenClaw a repeatable structure for
                briefs and tasks and records completion signals. This makes it
                easier to keep OpenClaw&apos;s memory aligned with what Starbeam
                is asking it to do.
              </p>
            </section>

            <section>
              <h2 className="sb-title text-xl font-extrabold">
                OpenClaw execution (v1)
              </h2>
              <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                If you want reliable &quot;OpenClaw execution&quot;, Starbeam can
                queue commands to your OpenClaw and track statuses like queued,
                running, completed, dismissed, or failed. You can run a single
                instance as a brief-receiver or as an autopilot executor.
              </p>
            </section>

            <section>
              <h2 className="sb-title text-xl font-extrabold">
                OpenClaw orchestration (v1)
              </h2>
              <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                If you have multiple OpenClaw instances, attach each one to the
                same Starbeam workspace with a role (for example: marketing,
                support, engineering). Starbeam can then direct work to the
                right OpenClaw, and you can see what happened across all of them
                in one place.
              </p>
            </section>
          </div>

          <div className="mt-10 sb-card-inset p-5">
            <div className="text-xs font-extrabold sb-title">Plugin details</div>
            <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
              This integration is shipped as an external OpenClaw plugin, so it
              does not require upstream changes in the OpenClaw repo.
            </div>
            <div className="mt-3 font-mono text-xs sb-card-inset p-3 text-[color:var(--sb-fg)] break-all">
              {`openclaw plugins install ${OPENCLAW_STARBEAM_PLUGIN_SPEC}`}
            </div>
            <div className="mt-3 text-xs text-[color:var(--sb-muted)]">
              Repo:{" "}
              <a
                href="https://github.com/Bikz/openclaw-starbeam"
                className="underline underline-offset-2"
                target="_blank"
                rel="noreferrer"
              >
                Bikz/openclaw-starbeam
              </a>
            </div>
          </div>

          <div className="mt-10 sb-card-inset p-5">
            <div className="text-xs font-extrabold sb-title">Security</div>
            <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
              Treat setup codes and refresh tokens as secrets. Do not paste them
              in public chats, logs, or screenshots.
            </p>
          </div>
        </div>
      </div>

      <script
        type="application/ld+json"
        // next/no-sync-scripts is too strict for JSON-LD; this is standard SEO.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}

