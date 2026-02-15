"use client";

import Link from "next/link";
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

export default function OnboardingTextStepForm(args: {
  workspaceSlug: string;
  title: string;
  description?: string;
  fieldName: "fullName" | "location" | "jobTitle" | "goal";
  label: string;
  placeholder?: string;
  defaultValue?: string;
  maxLength?: number;
  autoComplete?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  submitLabel?: string;
  skipHref?: string;
  action: ServerAction;
}) {
  const helpId = useId();
  const errorId = useId();
  const [value, setValue] = useState(args.defaultValue ?? "");

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
      ? (state.fieldErrors[args.fieldName] ?? "")
      : "";

  const canSubmit = value.trim().length > 0 && !pending;
  const describedBy = fieldError ? `${helpId} ${errorId}` : helpId;

  return (
    <form action={formAction}>
      <section className="sb-card p-7">
        <div>
          <h1 className="sb-title text-2xl font-extrabold">{args.title}</h1>
          {args.description ? (
            <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
              {args.description}
            </p>
          ) : null}
        </div>

        <label className="mt-7 grid gap-2 text-sm">
          <span className="text-[color:var(--sb-muted)]">{args.label}</span>
          <input
            name={args.fieldName}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="sb-input"
            placeholder={args.placeholder}
            autoComplete={args.autoComplete}
            inputMode={args.inputMode}
            maxLength={args.maxLength}
            disabled={pending}
            aria-describedby={describedBy}
            aria-invalid={Boolean(fieldError)}
          />
          <div
            id={helpId}
            className="text-[11px] text-[color:var(--sb-muted)] leading-relaxed"
          >
            {args.fieldName === "jobTitle"
              ? "Example: software engineer, B2B SaaS"
              : args.fieldName === "goal"
                ? "One sentence is enough. You can add more later."
                : null}
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
            {args.skipHref ? (
              <Link
                href={args.skipHref}
                className={sbButtonClass({
                  variant: "secondary",
                  className: "h-11 px-5 text-sm font-semibold",
                })}
              >
                Skip for now
              </Link>
            ) : null}
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
              {pending ? "Saving..." : (args.submitLabel ?? "Continue")}
            </button>
          </div>

          <div />
        </div>
      </div>
    </form>
  );
}
