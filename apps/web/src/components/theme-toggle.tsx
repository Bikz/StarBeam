"use client";

import { useEffect, useMemo, useState } from "react";

type ThemePref = "system" | "light" | "dark";

function readPref(): ThemePref {
  if (typeof window === "undefined") return "system";
  const raw = window.localStorage.getItem("sb_theme");
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

function computeIsDark(pref: ThemePref) {
  if (pref === "dark") return true;
  if (pref === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyPref(pref: ThemePref) {
  const root = document.documentElement;
  const isDark = computeIsDark(pref);

  root.dataset.sbTheme = pref;
  root.classList.toggle("dark", isDark);
  root.style.colorScheme = isDark ? "dark" : "light";

  window.localStorage.setItem("sb_theme", pref);
}

export default function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>(() => readPref());

  useEffect(() => {
    // Sync DOM to React state.
    applyPref(pref);
  }, [pref]);

  useEffect(() => {
    if (pref !== "system") return;

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyPref("system");
    if (mql.addEventListener) mql.addEventListener("change", handler);
    else mql.addListener(handler);

    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", handler);
      else mql.removeListener(handler);
    };
  }, [pref]);

  const options = useMemo(
    () =>
      [
        { id: "system" as const, label: "System" },
        { id: "light" as const, label: "Light" },
        { id: "dark" as const, label: "Dark" },
      ] satisfies Array<{ id: ThemePref; label: string }>,
    [],
  );

  return (
    <div
      className="sb-card-inset inline-flex items-center gap-1 p-1"
      role="group"
      aria-label="Theme"
    >
      {options.map((o) => {
        const active = pref === o.id;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            onClick={() => {
              setPref(o.id);
              applyPref(o.id);
            }}
            className={[
              "rounded-full px-3 py-1.5 text-[11px] font-semibold transition",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]",
              active
                ? "bg-white/70 dark:bg-white/10 text-[color:var(--sb-fg)] shadow-sm"
                : "text-[color:var(--sb-muted)] hover:text-[color:var(--sb-fg)]",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
