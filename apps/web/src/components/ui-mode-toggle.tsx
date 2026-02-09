"use client";

import { useUiMode } from "@/components/ui-mode";

export default function UiModeToggle() {
  const { mode, toggle } = useUiMode();
  const isAdvanced = mode === "advanced";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-xs text-[color:var(--sb-muted)]">
        Current:{" "}
        <span className="font-semibold text-[color:var(--sb-fg)]">
          {isAdvanced ? "Advanced" : "Simple"}
        </span>
      </div>
      <button
        type="button"
        onClick={toggle}
        className="sb-btn sb-btn-primary h-11 px-5 text-sm font-extrabold"
      >
        {isAdvanced ? "Disable advanced mode" : "Enable advanced mode"}
      </button>
    </div>
  );
}

