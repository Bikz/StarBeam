import { sbButtonClass } from "@starbeam/shared";
import Link from "next/link";

export default async function OpenClawSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const sp = await searchParams;
  const code = (sp.code ?? "").trim();

  const connectSnippet = code
    ? `/starbeam connect ${code}`
    : "/starbeam connect <setup-link-or-code>";

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="sb-card p-8">
          <div className="sb-title text-2xl">Starbeam x OpenClaw Setup</div>
          <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            This page is designed to be read by an OpenClaw instance. Follow the
            steps below to connect OpenClaw to Starbeam.
          </p>

          {code ? (
            <div className="mt-6 sb-card-inset p-4">
              <div className="text-xs font-semibold text-[color:var(--sb-muted)]">
                Setup code
              </div>
              <div className="mt-1 font-mono text-sm text-[color:var(--sb-fg)] break-all">
                {code}
              </div>
            </div>
          ) : (
            <div className="mt-6 sb-alert">
              Missing setup code. Ask the user to generate a fresh setup prompt
              from the Starbeam dashboard.
            </div>
          )}

          <div className="mt-8">
            <div className="text-xs font-extrabold sb-title">What to do</div>
            <ol className="mt-2 grid gap-2 text-sm text-[color:var(--sb-muted)] leading-relaxed list-decimal pl-5">
              <li>
                Ensure the OpenClaw{" "}
                <span className="font-semibold">starbeam</span> plugin is
                available. If <span className="font-mono">/starbeam</span> is
                unknown, update OpenClaw to the newest version and enable the
                plugin.
              </li>
              <li>
                In your control chat, run:
                <div className="mt-2 font-mono text-xs sb-card-inset p-3 text-[color:var(--sb-fg)] break-all">
                  {connectSnippet}
                </div>
              </li>
              <li>
                Then run:
                <div className="mt-2 font-mono text-xs sb-card-inset p-3 text-[color:var(--sb-fg)]">
                  /starbeam status
                </div>
              </li>
              <li>
                Start polling Starbeam for commands and report command results
                back to Starbeam.
              </li>
            </ol>
          </div>

          <div className="mt-8 sb-card-inset p-4">
            <div className="text-xs font-extrabold sb-title">Security</div>
            <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
              Treat the setup code and any refresh tokens as secrets. Never
              share them in public chats, logs, or screenshots.
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className={sbButtonClass({
                variant: "secondary",
                className: "h-11 px-5 text-sm font-semibold",
              })}
            >
              Go to Starbeam
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
