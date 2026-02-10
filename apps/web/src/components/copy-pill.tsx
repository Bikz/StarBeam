"use client";

import { useEffect, useId, useState } from "react";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older contexts (or when clipboard API is blocked).
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

export default function CopyPill({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const id = useId();

  useEffect(() => {
    if (copied === "idle") return;
    const t = window.setTimeout(() => setCopied("idle"), 1100);
    return () => window.clearTimeout(t);
  }, [copied]);

  const status =
    copied === "ok" ? "Copied" : copied === "fail" ? "Copy failed" : "";

  return (
    <button
      type="button"
      className={[
        "sb-kbd inline-flex items-center gap-2",
        className ?? "",
      ].join(" ")}
      onClick={async () => {
        const ok = await copyText(value);
        setCopied(ok ? "ok" : "fail");
      }}
      aria-describedby={status ? id : undefined}
      title="Click to copy workspace ID"
    >
      <span className="font-mono">{label}</span>
      <span className="sr-only" aria-live="polite" id={id}>
        {status}
      </span>
      {copied === "ok" ? (
        <span aria-hidden className="text-[10px] font-extrabold">
          Copied
        </span>
      ) : null}
    </button>
  );
}
