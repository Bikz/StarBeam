"use client";

import type { HTMLAttributes } from "react";
import { useActionState, useId, useMemo, useState } from "react";
import { sbButtonClass } from "@starbeam/shared";

import type { OnboardingActionState } from "./actions";
import { initialOnboardingActionState } from "./actions";

type ServerAction = (
  workspaceSlug: string,
  prev: OnboardingActionState,
  formData: FormData,
) => Promise<OnboardingActionState>;

function errorForField(
  state: OnboardingActionState,
  field: "company" | "companyUrl",
): string {
  if (state.ok !== false) return "";
  return state.fieldErrors?.[field] ?? "";
}

export default function OnboardingCompanyStepForm(args: {
  workspaceSlug: string;
  defaultCompany?: string;
  defaultCompanyUrl?: string;
  action: ServerAction;
}) {
  const companyHelpId = useId();
  const companyErrorId = useId();
  const urlHelpId = useId();
  const urlErrorId = useId();

  const [company, setCompany] = useState(args.defaultCompany ?? "");
  const [companyUrl, setCompanyUrl] = useState(args.defaultCompanyUrl ?? "");

  const bound = useMemo(
    () => args.action.bind(null, args.workspaceSlug),
    [args.action, args.workspaceSlug],
  );
  const [state, formAction, pending] = useActionState(
    bound,
    initialOnboardingActionState,
  );

  const companyError = errorForField(state, "company");
  const urlError = errorForField(state, "companyUrl");

  const canSubmit = company.trim().length > 0 && !pending;
  const companyDescribedBy = companyError
    ? `${companyHelpId} ${companyErrorId}`
    : companyHelpId;
  const urlDescribedBy = urlError ? `${urlHelpId} ${urlErrorId}` : urlHelpId;

  return (
    <form action={formAction}>
      <section className="sb-card p-7">
        <div>
          <h1 className="sb-title text-2xl font-extrabold">
            Where do you work, or what are you working on?
          </h1>
          <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            A company or project name is enough. Add a URL if you have one.
          </p>
        </div>

        <div className="mt-7 grid gap-4">
          <label className="grid gap-2 text-sm">
            <span className="text-[color:var(--sb-muted)]">
              Company or project
            </span>
            <input
              name="company"
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="sb-input"
              placeholder="Starbeam"
              autoComplete="organization"
              maxLength={120}
              disabled={pending}
              aria-describedby={companyDescribedBy}
              aria-invalid={Boolean(companyError)}
            />
            <div
              id={companyHelpId}
              className="text-[11px] text-[color:var(--sb-muted)] leading-relaxed"
            >
              If you&apos;re building something new, you can use a project name.
            </div>
          </label>

          <label className="grid gap-2 text-sm">
            <span className="text-[color:var(--sb-muted)]">
              Website (optional)
            </span>
            <input
              name="companyUrl"
              type="text"
              value={companyUrl}
              onChange={(e) => setCompanyUrl(e.target.value)}
              className="sb-input"
              placeholder="https://company.com"
              inputMode={"url" as HTMLAttributes<HTMLInputElement>["inputMode"]}
              autoComplete="url"
              maxLength={400}
              disabled={pending}
              aria-describedby={urlDescribedBy}
              aria-invalid={Boolean(urlError)}
            />
            <div
              id={urlHelpId}
              className="text-[11px] text-[color:var(--sb-muted)] leading-relaxed"
            >
              Used to help match your public profile and context.
            </div>
          </label>
        </div>

        {state?.ok === false && (companyError || urlError || state.message) ? (
          <div className="mt-4 sb-alert" role="status" aria-live="polite">
            {companyError ? (
              <div id={companyErrorId}>{companyError}</div>
            ) : null}
            {urlError ? <div id={urlErrorId}>{urlError}</div> : null}
            {!companyError && !urlError && state.message ? (
              <div>{state.message}</div>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="fixed bottom-0 left-0 right-0 border-t border-black/10 dark:border-white/10 bg-[color:var(--sb-bg0)]/95 backdrop-blur">
        <div className="sb-container py-4 grid grid-cols-3 items-center gap-3">
          <div />
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
