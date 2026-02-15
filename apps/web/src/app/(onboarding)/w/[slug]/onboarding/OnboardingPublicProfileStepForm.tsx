"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useMemo, useState } from "react";
import { sbButtonClass } from "@starbeam/shared";

import type { OnboardingActionState } from "./actions";
import { initialOnboardingActionState } from "./actions";

type ServerAction = (
  workspaceSlug: string,
  prev: OnboardingActionState,
  formData: FormData,
) => Promise<OnboardingActionState>;

type Candidate = {
  url: string;
  title: string;
  snippet?: string;
};

function hasText(value: string | null | undefined): boolean {
  return Boolean((value ?? "").trim());
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

export default function OnboardingPublicProfileStepForm(args: {
  workspaceSlug: string;
  skipHref: string;
  defaultUrl?: string;
  action: ServerAction;
}) {
  const helpId = useId();
  const errorId = useId();

  const [url, setUrl] = useState(args.defaultUrl ?? "");
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [fetchError, setFetchError] = useState<string>("");

  const bound = useMemo(
    () => args.action.bind(null, args.workspaceSlug),
    [args.action, args.workspaceSlug],
  );
  const [state, formAction, pending] = useActionState(
    bound,
    initialOnboardingActionState,
  );

  const fieldError =
    state?.ok === false && state.fieldErrors
      ? (state.fieldErrors.url ?? "")
      : "";

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setFetchError("");
      try {
        const resp = await fetch(
          `/api/onboarding/exa-candidates?workspaceSlug=${encodeURIComponent(args.workspaceSlug)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
          },
        );
        const json = (await resp.json()) as
          | { ok: true; candidates: Candidate[] }
          | { ok: false; error: string };

        if (cancelled) return;
        if (json.ok !== true) {
          const err = json.error;
          if (err === "exa_not_configured") {
            setFetchError("Profile suggestions are unavailable right now.");
          } else if (err === "Too many requests") {
            setFetchError("Too many requests. Try again in a moment.");
          } else {
            setFetchError("Could not load profile suggestions.");
          }
          setCandidates([]);
          return;
        }

        const list = Array.isArray(json.candidates) ? json.candidates : [];
        setCandidates(
          list
            .filter((c) => hasText(c.url))
            .slice(0, 3)
            .map((c) => ({
              url: c.url,
              title: c.title || hostLabel(c.url),
              snippet: c.snippet,
            })),
        );
      } catch {
        if (!cancelled) {
          setFetchError("Could not load profile suggestions.");
          setCandidates([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [args.workspaceSlug]);

  const canSubmit = url.trim().length > 0 && !pending;
  const describedBy = fieldError ? `${helpId} ${errorId}` : helpId;

  return (
    <form action={formAction}>
      <section className="sb-card p-7">
        <div>
          <h1 className="sb-title text-2xl font-extrabold">
            Help us find your public profile
          </h1>
          <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            We&apos;ll search the public web to enrich your profile. You can
            skip this.
          </p>
        </div>

        <div className="mt-6">
          <div className="text-xs font-extrabold sb-title">Suggestions</div>

          {loading ? (
            <div className="mt-3 grid gap-2">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={idx}
                  className="sb-card-inset px-4 py-3 animate-pulse"
                >
                  <div className="h-4 w-52 rounded bg-black/10 dark:bg-white/15" />
                  <div className="mt-2 h-3 w-72 rounded bg-black/10 dark:bg-white/15" />
                </div>
              ))}
            </div>
          ) : candidates.length ? (
            <div className="mt-3 grid gap-2">
              {candidates.map((c) => (
                <label
                  key={c.url}
                  className={[
                    "sb-card-inset px-4 py-3 text-sm cursor-pointer transition",
                    url === c.url
                      ? "border-black/15 dark:border-white/25 bg-black/5 dark:bg-white/10"
                      : "hover:border-black/10 hover:bg-black/[0.03] dark:hover:border-white/15 dark:hover:bg-white/[0.06]",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="candidate"
                      value={c.url}
                      checked={url === c.url}
                      onChange={() => setUrl(c.url)}
                      className="mt-1"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-[color:var(--sb-fg)] truncate">
                        {c.title}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--sb-muted)] truncate">
                        {hostLabel(c.url)}
                      </div>
                      {c.snippet ? (
                        <div className="mt-1 text-xs text-[color:var(--sb-muted)] leading-relaxed">
                          {c.snippet}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-sm text-[color:var(--sb-muted)]">
              {fetchError ? fetchError : "No suggestions found."}
            </div>
          )}
        </div>

        <label className="mt-7 grid gap-2 text-sm">
          <span className="text-[color:var(--sb-muted)]">
            Profile URL (optional)
          </span>
          <input
            name="url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="sb-input"
            placeholder="https://linkedin.com/in/..."
            autoComplete="url"
            maxLength={400}
            disabled={pending}
            aria-describedby={describedBy}
            aria-invalid={Boolean(fieldError)}
          />
          <div
            id={helpId}
            className="text-[11px] text-[color:var(--sb-muted)] leading-relaxed"
          >
            Paste LinkedIn or your personal site. We&apos;ll use it as profile
            context.
          </div>
        </label>

        {state?.ok === false ? (
          <div className="mt-4 sb-alert" role="status" aria-live="polite">
            {fieldError ? <div id={errorId}>{fieldError}</div> : null}
            {!fieldError && state.message ? <div>{state.message}</div> : null}
            {!fieldError && !state.message ? (
              <div>Could not continue. Please try again.</div>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="fixed bottom-0 left-0 right-0 border-t border-black/10 dark:border-white/10 bg-[color:var(--sb-bg0)]/95 backdrop-blur">
        <div className="sb-container py-4 grid grid-cols-3 items-center gap-3">
          <div className="justify-self-start">
            <Link
              href={args.skipHref}
              className={sbButtonClass({
                variant: "secondary",
                className: "h-11 px-5 text-sm font-semibold",
              })}
            >
              Skip for now
            </Link>
          </div>

          <div className="justify-self-center">
            <button
              type="submit"
              className={sbButtonClass({
                variant: "primary",
                className: "h-11 px-8 text-sm font-extrabold",
              })}
              disabled={!canSubmit}
              aria-busy={pending}
            >
              {pending ? "Saving..." : "Continue"}
            </button>
          </div>

          <div />
        </div>
      </div>
    </form>
  );
}
