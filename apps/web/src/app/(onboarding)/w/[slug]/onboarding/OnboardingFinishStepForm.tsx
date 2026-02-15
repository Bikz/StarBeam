"use client";

import { useActionState, useMemo } from "react";
import { sbButtonClass } from "@starbeam/shared";

import type { OnboardingActionState } from "./actions";
import { initialOnboardingActionState } from "./actions";

type ServerAction = (
  workspaceSlug: string,
  prev: OnboardingActionState,
  formData: FormData,
) => Promise<OnboardingActionState>;

export default function OnboardingFinishStepForm(args: {
  workspaceSlug: string;
  action: ServerAction;
}) {
  const bound = useMemo(
    () => args.action.bind(null, args.workspaceSlug),
    [args.action, args.workspaceSlug],
  );
  const [state, formAction, pending] = useActionState(
    bound,
    initialOnboardingActionState,
  );

  return (
    <form action={formAction}>
      <section className="sb-card p-7">
        <div>
          <h1 className="sb-title text-2xl font-extrabold">
            You&apos;re set. Starbeam is about to generate your first pulse.
          </h1>
          <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            We&apos;ll kick off the first run now. It usually completes in a few
            minutes.
          </p>
        </div>

        <div className="mt-6 sb-card-inset p-5 text-sm text-[color:var(--sb-muted)] leading-relaxed">
          Pulses summarize what changed and what to do next, based on your
          context and connected sources. You can add teammates and OpenClaws
          later to extend this across your workspace.
        </div>

        {state?.ok === false ? (
          <div className="mt-5 sb-alert" role="status" aria-live="polite">
            {state.message ? (
              <div>{state.message}</div>
            ) : (
              <div>Could not start your first pulse. Please try again.</div>
            )}
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
              disabled={pending}
              aria-busy={pending}
            >
              {pending ? "Starting..." : "Start my first pulse"}
            </button>
          </div>
          <div />
        </div>
      </div>
    </form>
  );
}
