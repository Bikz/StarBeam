"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { sbButtonClass } from "@starbeam/shared";

function initialsFromEmail(email: string): string {
  const raw = (email ?? "").trim();
  const local = raw.split("@")[0] ?? "";
  const parts = local
    .split(/[^A-Za-z0-9]+/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const first = parts[0] ?? "";
  const second = parts[1] ?? "";
  if (first && second) return `${first[0]}${second[0]}`.toUpperCase();
  if (first) return first.slice(0, 2).toUpperCase();
  return "?";
}

function focusFirstAction(root: HTMLElement | null) {
  if (!root) return;
  const el = root.querySelector<HTMLElement>("a[href],button:not([disabled])");
  el?.focus?.();
}

export default function ProfileMenu({
  email,
  settingsHref,
  showWorkspaces,
}: {
  email: string;
  settingsHref: string | null;
  showWorkspaces: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const initials = useMemo(() => initialsFromEmail(email), [email]);

  useEffect(() => {
    if (!open) return;

    const button = buttonRef.current;

    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (wrapRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
    };

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);

    const raf = requestAnimationFrame(() => focusFirstAction(menuRef.current));

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
      button?.focus?.();
    };
  }, [open]);

  const itemClass = [
    "flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-semibold",
    "border border-transparent hover:border-black/10 hover:bg-black/[0.03] dark:hover:border-white/10 dark:hover:bg-white/[0.04]",
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]",
    "text-[color:var(--sb-fg)]",
  ].join(" ");

  return (
    <div className="relative" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Open profile menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={sbButtonClass({
          variant: "secondary",
          size: "icon",
          className: open ? "border-black/10 dark:border-white/15" : "",
        })}
      >
        <span className="text-[11px] font-extrabold">{initials}</span>
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Profile"
          className="absolute right-0 z-30 mt-2 w-64 sb-card p-2"
        >
          <div className="px-3 py-2 text-xs text-[color:var(--sb-muted)] truncate">
            {email}
          </div>

          {settingsHref || showWorkspaces ? (
            <div className="my-1 h-px bg-[color:var(--sb-divider)]" />
          ) : null}

          {settingsHref ? (
            <Link
              href={settingsHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              Settings
            </Link>
          ) : null}

          {showWorkspaces ? (
            <Link
              href="/workspaces"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              Workspaces
            </Link>
          ) : null}

          <div className="my-1 h-px bg-[color:var(--sb-divider)]" />

          <Link
            href="/signout?callbackUrl=/login"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            Sign out
          </Link>
        </div>
      ) : null}
    </div>
  );
}
