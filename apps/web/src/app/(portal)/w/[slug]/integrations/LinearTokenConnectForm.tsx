"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { sbButtonClass } from "@starbeam/shared";

import HelpTip from "@/components/help-tip";
import { initialConnectState } from "@/app/(portal)/w/[slug]/integrations/connectState";
import { connectLinearAction } from "@/app/(portal)/w/[slug]/integrations/linearActions";

function hasToken(value: string): boolean {
  return value.trim().length > 0;
}

export default function LinearTokenConnectForm({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const helpId = useId();
  const tokenErrorId = useId();
  const [token, setToken] = useState("");

  const bound = useMemo(
    () => connectLinearAction.bind(null, workspaceSlug),
    [workspaceSlug],
  );
  const [state, formAction, pending] = useActionState(
    bound,
    initialConnectState,
  );

  const canSubmit = hasToken(token) && !pending;
  const tokenError =
    state?.ok === false && state.fieldErrors?.token
      ? state.fieldErrors.token
      : "";

  return (
    <form action={formAction} className="mt-5 grid gap-3">
      <label className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-extrabold sb-title">API key</div>
          <div className="flex items-center gap-2">
            <a
              href="https://linear.app/settings/account/security"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-semibold text-[color:var(--sb-muted)] hover:text-[color:var(--sb-fg)] hover:underline"
            >
              Create API key
            </a>
            <HelpTip text="We’ll verify your key and store it encrypted. Use a key tied to the Linear account you want to ingest." />
          </div>
        </div>

        <input
          name="token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="sb-input"
          placeholder="lin_api_…"
          aria-describedby={tokenError ? `${helpId} ${tokenErrorId}` : helpId}
          aria-invalid={Boolean(tokenError)}
          disabled={pending}
        />
        <div
          id={helpId}
          className="text-[11px] text-[color:var(--sb-muted)] leading-relaxed"
        >
          Starbeam reads your assigned issues and recent updates to build your
          pulse context.
        </div>
      </label>

      <div>
        <button
          type="submit"
          className={sbButtonClass({
            variant: "primary",
            className: "h-11 px-5 text-sm font-extrabold",
          })}
          disabled={!canSubmit}
          aria-busy={pending}
        >
          {pending ? "Connecting…" : "Connect Linear"}
        </button>
      </div>
      {!hasToken(token) ? (
        <div className="text-[11px] text-[color:var(--sb-muted)] leading-relaxed">
          Paste an API key to enable the connect button.
        </div>
      ) : null}

      {state?.ok === false ? (
        <div className="sb-alert" role="status" aria-live="polite">
          {state.fieldErrors?.token ? (
            <div id={tokenErrorId}>{state.fieldErrors.token}</div>
          ) : state.message ? (
            <div>{state.message}</div>
          ) : (
            <div>Could not connect Linear. Please try again.</div>
          )}
        </div>
      ) : null}
    </form>
  );
}
