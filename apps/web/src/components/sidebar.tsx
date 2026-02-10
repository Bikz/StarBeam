"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { sbButtonClass } from "@starbeam/shared";

import type {
  ActiveWorkspace,
  ShellUser,
  ShellWorkspace,
} from "@/components/app-shell";
import type { UiMode } from "@/components/ui-mode";
import { useUiMode } from "@/components/ui-mode";
import {
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconGrid,
  IconHome,
  IconList,
  IconLogout,
  IconMegaphone,
  IconMessage,
  IconPlug,
  IconSettings,
  IconSpark,
  IconUsers,
} from "@/components/sb-icons";

type NavIcon =
  | "dashboard"
  | "workspaces"
  | "pulse"
  | "settings"
  | "tracks"
  | "announcements"
  | "people"
  | "integrations"
  | "runs";

type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  match?: "exact" | "prefix";
};

function isActivePathname(pathname: string, item: NavItem): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function iconFor(icon: NavIcon, className: string) {
  if (icon === "dashboard") return <IconHome className={className} />;
  if (icon === "workspaces") return <IconGrid className={className} />;
  if (icon === "pulse") return <IconSpark className={className} />;
  if (icon === "settings") return <IconSettings className={className} />;
  if (icon === "tracks") return <IconList className={className} />;
  if (icon === "announcements") return <IconMegaphone className={className} />;
  if (icon === "people") return <IconUsers className={className} />;
  if (icon === "integrations") return <IconPlug className={className} />;
  return <IconClock className={className} />;
}

function workspaceInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/g)
    .map((p) => p.trim())
    .filter(Boolean);
  const first = parts[0];
  if (!first) return "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const second = parts[1] ?? "";
  return `${first[0] ?? "?"}${second[0] ?? "?"}`.toUpperCase();
}

function isManageRole(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

function navFor(
  activeWorkspace: ActiveWorkspace,
  mode: UiMode,
): { global: NavItem[]; workspace: NavItem[] } {
  const global: NavItem[] =
    mode === "advanced"
      ? [
          {
            href: "/dashboard",
            label: "Dashboard",
            icon: "dashboard",
            match: "exact",
          },
          {
            href: "/workspaces",
            label: "Workspaces",
            icon: "workspaces",
            match: "exact",
          },
        ]
      : [];
  if (!activeWorkspace) return { global, workspace: [] };

  const base = `/w/${activeWorkspace.slug}`;
  const workspace: NavItem[] = [
    { href: `${base}/pulse`, label: "Pulse", icon: "pulse" },
    { href: `${base}/settings`, label: "Settings", icon: "settings" },
  ];

  if (mode === "simple") return { global, workspace };

  // Advanced mode: reveal additional surfaces, but avoid showing admin-only pages
  // to non-managers by default.
  workspace.push({
    href: `${base}/integrations`,
    label: "Integrations",
    icon: "integrations",
  });

  if (isManageRole(activeWorkspace.role)) {
    workspace.push(
      { href: `${base}/tracks`, label: "Tracks", icon: "tracks" },
      {
        href: `${base}/announcements`,
        label: "Announcements",
        icon: "announcements",
      },
      { href: `${base}/members`, label: "People", icon: "people" },
      { href: `${base}/jobs`, label: "Runs", icon: "runs" },
    );
  }
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
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  if (collapsed) {
    return (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        aria-label={item.label}
        title={item.label}
        onClick={onNavigate}
        className={[
          "group grid h-11 w-11 place-items-center rounded-xl border border-transparent",
          "hover:border-black/10 hover:bg-black/[0.03] dark:hover:border-white/10 dark:hover:bg-white/[0.04]",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]",
          active
            ? "border-black/10 bg-black/[0.04] dark:border-white/15 dark:bg-white/[0.06]"
            : "",
        ].join(" ")}
      >
        {iconFor(item.icon, "h-5 w-5")}
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={[
        "group flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm",
        "border border-transparent hover:border-black/10 hover:bg-black/[0.03] dark:hover:border-white/10 dark:hover:bg-white/[0.04]",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]",
        active
          ? "border-black/10 bg-black/[0.04] dark:border-white/15 dark:bg-white/[0.06]"
          : "",
      ].join(" ")}
    >
      <span className="flex items-center gap-3 min-w-0">
        <span className="text-[color:var(--sb-muted)] group-hover:text-[color:var(--sb-fg)]">
          {iconFor(item.icon, "h-4 w-4")}
        </span>
        <span className="min-w-0 truncate font-semibold text-[color:var(--sb-fg)]">
          {item.label}
        </span>
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
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]",
        active
          ? "border-black/10 bg-black/[0.04] dark:border-white/15 dark:bg-white/[0.06]"
          : "",
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
  collapsed: collapsedProp,
  onToggleCollapsed,
  onNavigate,
}: {
  user: ShellUser;
  workspaces: ShellWorkspace[];
  activeWorkspace: ActiveWorkspace;
  variant: "desktop" | "drawer";
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}) {
  const { mode } = useUiMode();
  const collapsed = variant === "desktop" && Boolean(collapsedProp);
  const pathname = usePathname();
  const [workspaceQuery, setWorkspaceQuery] = useState("");
  const homeHref = activeWorkspace
    ? `/w/${activeWorkspace.slug}/pulse`
    : "/dashboard";
  const feedbackHref = useMemo(() => {
    const p = pathname || "/";
    return `/feedback?path=${encodeURIComponent(p)}`;
  }, [pathname]);

  const nav = useMemo(
    () => navFor(activeWorkspace, mode),
    [activeWorkspace, mode],
  );
  const showWorkspaceSearch = workspaces.length > 8;
  const globalHasWorkspaces = nav.global.some((i) => i.href === "/workspaces");
  const showAllWorkspacesLink = workspaces.length > 8 && !globalHasWorkspaces;
  const workspaceMatches = useMemo(() => {
    const q = workspaceQuery.trim().toLowerCase();
    if (!q) return workspaces.slice(0, 8);
    return workspaces
      .filter((w) => {
        const name = (w.name ?? "").toLowerCase();
        const slug = (w.slug ?? "").toLowerCase();
        return name.includes(q) || slug.includes(q);
      })
      .slice(0, 12);
  }, [workspaces, workspaceQuery]);

  const content = (
    <nav aria-label="Primary" className="sb-card p-4">
      <div
        className={[
          "flex gap-2",
          collapsed
            ? "flex-col items-center"
            : "flex-row items-center justify-between",
        ].join(" ")}
      >
        <Link
          href={homeHref}
          onClick={onNavigate}
          aria-label={collapsed ? "Starbeam dashboard" : undefined}
          className={[
            "flex items-center gap-3 min-w-0 rounded-xl",
            "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]",
          ].join(" ")}
        >
          <div className="sb-card-inset grid h-10 w-10 place-items-center border border-black/10 dark:border-white/10">
            <Image
              src="/brand/starbeam-logo-light.png"
              alt=""
              width={28}
              height={28}
              priority
              className="block dark:hidden"
            />
            <Image
              src="/brand/starbeam-logo-dark.png"
              alt=""
              width={28}
              height={28}
              priority
              className="hidden dark:block"
            />
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <div className="sb-title text-sm font-extrabold leading-none">
                Starbeam
              </div>
              <div className="mt-1 text-xs text-[color:var(--sb-muted)] truncate">
                {activeWorkspace ? activeWorkspace.name : user.email}
              </div>
            </div>
          ) : null}
        </Link>

        {variant === "desktop" && onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={sbButtonClass({
              variant: "secondary",
              size: "icon",
              className: collapsed ? "h-10 w-10" : "",
            })}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? (
              <IconChevronRight className="h-5 w-5" />
            ) : (
              <IconChevronLeft className="h-5 w-5" />
            )}
          </button>
        ) : null}
      </div>

      {collapsed ? (
        <div className="mt-5 grid gap-2 justify-items-center">
          {activeWorkspace ? (
            <Link
              href={`/w/${activeWorkspace.slug}`}
              onClick={onNavigate}
              className={[
                "grid h-11 w-11 place-items-center rounded-xl border border-black/10 dark:border-white/10",
                "bg-black/[0.03] dark:bg-white/[0.05]",
                "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]",
              ].join(" ")}
              aria-label={`Open ${activeWorkspace.name}`}
              title={activeWorkspace.name}
            >
              <span className="text-xs font-extrabold text-[color:var(--sb-fg)]">
                {workspaceInitials(activeWorkspace.name)}
              </span>
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 grid gap-2">
          <SectionLabel>Workspaces</SectionLabel>
          {showWorkspaceSearch ? (
            <label className="sr-only" htmlFor="sb-workspace-search">
              Search workspaces
            </label>
          ) : null}
          {showWorkspaceSearch ? (
            <input
              id="sb-workspace-search"
              value={workspaceQuery}
              onChange={(e) => setWorkspaceQuery(e.target.value)}
              className="sb-input sb-input-compact"
              placeholder="Search…"
              autoComplete="off"
            />
          ) : null}
          <div className="grid gap-1">
            {workspaceMatches.map((w) => (
              <WorkspaceLink
                key={w.slug}
                w={w}
                active={!!activeWorkspace && w.slug === activeWorkspace.slug}
                onNavigate={onNavigate}
              />
            ))}
          </div>
          {workspaces.length > 8 ? (
            <Link
              href="/workspaces"
              onClick={onNavigate}
              className={sbButtonClass({
                variant: "secondary",
                className: "h-10 px-4 text-xs font-semibold",
              })}
            >
              All workspaces
            </Link>
          ) : null}
        </div>
      )}

      <div className="mt-5 grid gap-2">
        {!collapsed ? <SectionLabel>Navigate</SectionLabel> : null}
        <div
          className={
            collapsed ? "grid gap-1 justify-items-center" : "grid gap-1"
          }
        >
          {nav.global.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              active={isActivePathname(pathname, item)}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        {nav.workspace.length ? (
          <div
            className={
              collapsed
                ? "mt-2 grid gap-1 justify-items-center"
                : "mt-2 grid gap-1"
            }
          >
            {nav.workspace.map((item) => (
              <SidebarLink
                key={item.href}
                item={item}
                active={isActivePathname(pathname, item)}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : null}

        {collapsed && showAllWorkspacesLink ? (
          <div className="mt-2 grid gap-1 justify-items-center">
            <Link
              href="/workspaces"
              onClick={onNavigate}
              className={sbButtonClass({ className: "h-11 w-11" })}
              aria-label="All workspaces"
              title="All workspaces"
            >
              <IconGrid className="h-5 w-5" />
            </Link>
          </div>
        ) : null}
      </div>

      <div className="mt-5">
        <div className="h-px bg-[color:var(--sb-divider)]" />
        <div
          className={
            collapsed
              ? "mt-4 grid gap-2 justify-items-center"
              : "mt-4 grid gap-2"
          }
        >
          {collapsed ? (
            <Link
              href={feedbackHref}
              onClick={onNavigate}
              className={sbButtonClass({ className: "h-11 w-11" })}
              aria-label="Feedback"
              title="Feedback"
            >
              <IconMessage className="h-5 w-5" />
            </Link>
          ) : (
            <Link
              href={feedbackHref}
              onClick={onNavigate}
              className={sbButtonClass({
                variant: "secondary",
                className: "h-10 px-4 text-xs font-semibold",
              })}
            >
              Feedback
            </Link>
          )}

          {collapsed ? (
            <Link
              href="/signout?callbackUrl=/login"
              className={sbButtonClass({
                variant: "primary",
                className: "h-11 w-11",
              })}
              aria-label="Sign out"
              title="Sign out"
            >
              <IconLogout className="h-5 w-5" />
            </Link>
          ) : (
            <Link
              href="/signout?callbackUrl=/login"
              className={sbButtonClass({
                variant: "primary",
                className: "h-10 px-4 text-xs font-extrabold",
              })}
            >
              Sign out
            </Link>
          )}
        </div>
      </div>
    </nav>
  );

  if (variant === "drawer") {
    return <div className="p-4">{content}</div>;
  }

  return content;
}
