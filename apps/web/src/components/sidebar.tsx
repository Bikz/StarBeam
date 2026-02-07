"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import ThemeToggle from "@/components/theme-toggle";
import type { ActiveWorkspace, ShellUser, ShellWorkspace } from "@/components/app-shell";

type NavItem = {
  href: string;
  label: string;
  match?: "exact" | "prefix";
};

function isActivePathname(pathname: string, item: NavItem): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function navFor(activeWorkspace: ActiveWorkspace): { global: NavItem[]; workspace: NavItem[] } {
  const global: NavItem[] = [{ href: "/dashboard", label: "Dashboard", match: "exact" }];
  if (!activeWorkspace) return { global, workspace: [] };

  const base = `/w/${activeWorkspace.slug}`;
  const workspace: NavItem[] = [
    { href: `${base}/onboarding`, label: "Setup" },
    { href: `${base}/pulse`, label: "Pulse" },
    { href: `${base}/tracks`, label: "Tracks" },
    { href: `${base}/announcements`, label: "Announcements" },
    { href: `${base}/members`, label: "People" },
    { href: `${base}/integrations`, label: "Integrations" },
    { href: `${base}/jobs`, label: "Runs" },
  ];
  return { global, workspace };
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="px-2 text-[11px] font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
      {children}
    </div>
  );
}

function SidebarLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={[
        "group flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm",
        "border border-transparent hover:border-black/10 hover:bg-black/[0.03] dark:hover:border-white/10 dark:hover:bg-white/[0.04]",
        active ? "border-black/10 bg-black/[0.04] dark:border-white/15 dark:bg-white/[0.06]" : "",
      ].join(" ")}
    >
      <span className="min-w-0 truncate font-semibold text-[color:var(--sb-fg)]">
        {item.label}
      </span>
      <span
        className={[
          "h-1.5 w-1.5 rounded-full transition",
          active
            ? "bg-[color:var(--sb-fg)] opacity-70"
            : "bg-[color:var(--sb-muted)] opacity-0 group-hover:opacity-40",
        ].join(" ")}
        aria-hidden
      />
    </Link>
  );
}

function WorkspaceLink({
  w,
  active,
  onNavigate,
}: {
  w: ShellWorkspace;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={`/w/${w.slug}`}
      onClick={onNavigate}
      className={[
        "flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm",
        "border border-transparent hover:border-black/10 hover:bg-black/[0.03] dark:hover:border-white/10 dark:hover:bg-white/[0.04]",
        active ? "border-black/10 bg-black/[0.04] dark:border-white/15 dark:bg-white/[0.06]" : "",
      ].join(" ")}
      aria-current={active ? "page" : undefined}
      title={w.name}
    >
      <span className="min-w-0 truncate font-semibold text-[color:var(--sb-fg)]">
        {w.name}
      </span>
      <span className="text-[11px] font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
        {w.type}
      </span>
    </Link>
  );
}

export default function Sidebar({
  user,
  workspaces,
  activeWorkspace,
  variant,
  onNavigate,
}: {
  user: ShellUser;
  workspaces: ShellWorkspace[];
  activeWorkspace: ActiveWorkspace;
  variant: "desktop" | "drawer";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const feedbackHref = useMemo(() => {
    const p = pathname || "/";
    return `/feedback?path=${encodeURIComponent(p)}`;
  }, [pathname]);

  const nav = useMemo(() => navFor(activeWorkspace), [activeWorkspace]);

  const content = (
    <div className="sb-card p-4">
      <div className="flex items-center gap-3">
        <div className="sb-card-inset grid h-10 w-10 place-items-center border border-black/10 dark:border-white/10">
          <span className="sb-title text-base font-extrabold" aria-hidden>
            *
          </span>
        </div>
        <div className="min-w-0">
          <div className="sb-title text-sm font-extrabold leading-none">
            Starbeam
          </div>
          <div className="mt-1 text-xs text-[color:var(--sb-muted)] truncate">
            {activeWorkspace ? activeWorkspace.name : user.email}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        <SectionLabel>Workspaces</SectionLabel>
        <div className="grid gap-1">
          {workspaces.slice(0, 8).map((w) => (
            <WorkspaceLink
              key={w.slug}
              w={w}
              active={!!activeWorkspace && w.slug === activeWorkspace.slug}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        <SectionLabel>Navigate</SectionLabel>
        <div className="grid gap-1">
          {nav.global.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              active={isActivePathname(pathname, item)}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        {nav.workspace.length ? (
          <div className="mt-2 grid gap-1">
            {nav.workspace.map((item) => (
              <SidebarLink
                key={item.href}
                item={item}
                active={isActivePathname(pathname, item)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-5">
        <div className="h-px bg-[color:var(--sb-divider)]" />
        <div className="mt-4 grid gap-2">
          <ThemeToggle />
          <Link
            href={feedbackHref}
            onClick={onNavigate}
            className="sb-btn inline-flex items-center justify-center h-10 px-4 text-xs font-semibold text-[color:var(--sb-fg)]"
          >
            Feedback
          </Link>
          <Link
            href="/api/auth/signout?callbackUrl=/login"
            className="sb-btn sb-btn-primary inline-flex items-center justify-center h-10 px-4 text-xs font-extrabold text-[color:var(--sb-fg)]"
          >
            Sign out
          </Link>
        </div>
      </div>
    </div>
  );

  if (variant === "drawer") {
    return <div className="p-4">{content}</div>;
  }

  return content;
}
