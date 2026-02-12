"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { sbButtonClass } from "@starbeam/shared";

import HelpTip from "@/components/help-tip";
import { initialConnectState } from "@/app/(portal)/w/[slug]/integrations/connectState";
import { connectGitHubAction } from "@/app/(portal)/w/[slug]/integrations/githubActions";

function hasToken(value: string): boolean {
  return value.trim().length > 0;
}

export default function GitHubTokenConnectForm({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const helpId = useId();
  const tokenErrorId = useId();
  const repoErrorId = useId();
  const [token, setToken] = useState("");

  const bound = useMemo(
    () => connectGitHubAction.bind(null, workspaceSlug),
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
  const repoError =
    state?.ok === false && state.fieldErrors?.repos
      ? state.fieldErrors.repos
      : "";

  return (
    <form action={formAction} className="mt-5 grid gap-3">
      <label className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-extrabold sb-title">
            Personal access token
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/settings/personal-access-tokens/new"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-semibold text-[color:var(--sb-muted)] hover:text-[color:var(--sb-fg)] hover:underline"
            >
              Create token
            </a>
            <HelpTip text="We’ll verify your token and store it encrypted. Use a read-only token with access to the repos you want Starbeam to ingest." />
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
          placeholder="ghp_…"
          aria-describedby={tokenError ? `${helpId} ${tokenErrorId}` : helpId}
          aria-invalid={Boolean(tokenError)}
          disabled={pending}
        />
        <div
          id={helpId}
          className="text-[11px] text-[color:var(--sb-muted)] leading-relaxed"
        >
          We’ll verify the token, then save it. You can revoke it anytime in
          GitHub.
        </div>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-extrabold sb-title">Repo scope</div>
            <HelpTip text="Recommended: Selected repos. Starbeam won’t ingest GitHub until you list at least one repo." />
          </div>
          <select
            name="mode"
            defaultValue="SELECTED"
            className="sb-select"
            disabled={pending}
          >
            <option value="SELECTED">Selected repos only (recommended)</option>
            <option value="ALL">All accessible repos</option>
          </select>
        </label>

        <label className="grid gap-2">
          <div className="text-xs font-extrabold sb-title">Selected repos</div>
          <textarea
            name="repos"
            rows={3}
            className="sb-textarea sb-textarea-compact"
            placeholder={"owner/repo\nowner/another-repo"}
            aria-describedby={repoError ? repoErrorId : undefined}
            aria-invalid={Boolean(repoError)}
            disabled={pending}
          />
        </label>
      </div>

      <div className="text-[11px] text-[color:var(--sb-muted)] leading-relaxed">
        Tip: keep workspace context scoped. If you choose Selected, Starbeam
        won’t ingest GitHub until you list one or more repos.
      </div>

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
          {pending ? "Connecting…" : "Connect GitHub"}
        </button>
      </div>
      {!hasToken(token) ? (
        <div className="text-[11px] text-[color:var(--sb-muted)] leading-relaxed">
          Paste a token to enable the connect button.
        </div>
      ) : null}

      {state?.ok === false ? (
        <div className="sb-alert" role="status" aria-live="polite">
          {state.fieldErrors?.token ? (
            <div id={tokenErrorId}>{state.fieldErrors.token}</div>
          ) : state.fieldErrors?.repos ? (
            <div id={repoErrorId}>{state.fieldErrors.repos}</div>
          ) : state.message ? (
            <div>{state.message}</div>
          ) : (
            <div>Could not connect GitHub. Please try again.</div>
          )}
        </div>
      ) : null}
    </form>
  );
}
