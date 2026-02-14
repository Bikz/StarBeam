"use client";

import { useEffect, useState } from "react";
import { sbButtonClass } from "@starbeam/shared";

import { generateOpenClawSetupPrompt } from "@/app/(portal)/w/[slug]/openclaws/actions";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export default function SetupPromptCopyButton({
  workspaceSlug,
  openclawAgentId,
}: {
  workspaceSlug: string;
  openclawAgentId: string;
}) {
  const [state, setState] = useState<"idle" | "working" | "ok" | "fail">(
    "idle",
  );

  useEffect(() => {
    if (state === "idle" || state === "working") return;
    const t = window.setTimeout(() => setState("idle"), 1400);
    return () => window.clearTimeout(t);
  }, [state]);

  const label =
    state === "working"
      ? "Generating…"
      : state === "ok"
        ? "Copied"
        : state === "fail"
          ? "Copy failed"
          : "Copy OpenClaw setup prompt";

  return (
    <button
      type="button"
      className={sbButtonClass({
        variant: "secondary",
        className: "h-10 px-4 text-xs font-semibold",
      })}
      onClick={async () => {
        setState("working");
        try {
          const prompt = await generateOpenClawSetupPrompt(
            workspaceSlug,
            openclawAgentId,
          );
          const ok = await copyText(prompt);
          setState(ok ? "ok" : "fail");
        } catch {
          setState("fail");
        }
      }}
    >
      {label}
    </button>
  );
}
