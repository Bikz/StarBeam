"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { sbButtonClass } from "@starbeam/shared";

import { initialConnectState } from "@/app/(portal)/w/[slug]/integrations/connectState";
import { updateGitHubRepoSelectionAction } from "@/app/(portal)/w/[slug]/integrations/githubActions";

type RepoMode = "ALL" | "SELECTED";

export default function GitHubRepoSelectionForm({
  workspaceSlug,
  connectionId,
  initialMode,
  initialRepos,
}: {
  workspaceSlug: string;
  connectionId: string;
  initialMode: RepoMode;
  initialRepos: string[];
}) {
  const repoErrorId = useId();
  const [mode, setMode] = useState<RepoMode>(initialMode);
  const [repos, setRepos] = useState(initialRepos.join("\n"));

  const bound = useMemo(
    () =>
      updateGitHubRepoSelectionAction.bind(null, workspaceSlug, connectionId),
    [connectionId, workspaceSlug],
  );
  const [state, formAction, pending] = useActionState(
    bound,
    initialConnectState,
  );

  const repoError =
    state?.ok === false && state.fieldErrors?.repos
      ? state.fieldErrors.repos
      : "";
  const showSelectedWarning =
    mode === "SELECTED" &&
    repos.trim().split(/\s+/).filter(Boolean).length === 0;

  return (
    <form action={formAction} className="grid w-full gap-2">
      <div className="grid gap-1">
        <div className="text-[11px] font-extrabold sb-title">Repo scope</div>
        <select
          name="mode"
          value={mode}
          onChange={(e) =>
            setMode(e.target.value === "ALL" ? "ALL" : "SELECTED")
          }
          className="sb-select sb-select-compact"
          disabled={pending}
        >
          <option value="ALL">All accessible repos</option>
          <option value="SELECTED">Selected repos only</option>
        </select>
      </div>

      <div className="grid gap-1">
        <div className="text-[11px] font-extrabold sb-title">
          Selected repos
        </div>
        <textarea
          name="repos"
          value={repos}
          onChange={(e) => setRepos(e.target.value)}
          rows={3}
          className="sb-textarea sb-textarea-compact"
          placeholder={"owner/repo\nowner/another-repo"}
          aria-describedby={repoError ? repoErrorId : undefined}
          aria-invalid={Boolean(repoError)}
          disabled={pending}
        />
        <div className="text-[11px] text-[color:var(--sb-muted)]">
          Used only when repo scope is set to Selected.
        </div>
        {showSelectedWarning ? (
          <div className="text-[11px] text-[color:var(--sb-muted)]">
            No repos selected yet, so GitHub sync will be skipped.
          </div>
        ) : null}
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className={sbButtonClass({
            variant: "secondary",
            className: "px-4 py-2 text-xs font-semibold",
          })}
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? "Saving…" : "Save scope"}
        </button>
      </div>

      {state?.ok === false ? (
        <div className="sb-alert" role="status" aria-live="polite">
          {state.fieldErrors?.repos ? (
            <div id={repoErrorId}>{state.fieldErrors.repos}</div>
          ) : state.message ? (
            <div>{state.message}</div>
          ) : (
            <div>Could not update repo scope. Please try again.</div>
          )}
        </div>
      ) : null}
    </form>
  );
}
