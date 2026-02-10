"use client";

import { usePathname } from "next/navigation";
import { sbButtonClass } from "@starbeam/shared";
import type { ActiveWorkspace, ShellUser } from "@/components/app-shell";
import { IconSearch } from "@/components/sb-icons";
import ProfileMenu from "@/components/profile-menu";

function sectionLabel(
  pathname: string,
  activeWorkspace: ActiveWorkspace,
): string {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname === "/workspaces") return "Workspaces";
  if (pathname.startsWith("/feedback")) return "Feedback";
  if (pathname.startsWith("/admin")) return "Admin";

  if (activeWorkspace) {
    const base = `/w/${activeWorkspace.slug}`;
    const map: Array<{ label: string; href: string }> = [
      { label: "Pulse", href: `${base}/pulse` },
      { label: "Profile", href: `${base}/profile` },
      { label: "Settings", href: `${base}/settings` },
      { label: "Goals", href: `${base}/tracks` },
      { label: "Announcements", href: `${base}/announcements` },
      { label: "People", href: `${base}/members` },
      { label: "Integrations", href: `${base}/integrations` },
      { label: "Runs", href: `${base}/jobs` },
    ];

    const match = map.find(
      (m) => pathname === m.href || pathname.startsWith(`${m.href}/`),
    );
    if (match) return match.label;

    // Legacy / auxiliary routes that still matter to core journeys.
    if (
      pathname === `${base}/goals` ||
      pathname.startsWith(`${base}/goals/`) ||
      pathname === `${base}/departments` ||
      pathname.startsWith(`${base}/departments/`)
    ) {
      return "Goals";
    }
    if (pathname === `${base}/google` || pathname.startsWith(`${base}/google/`))
      return "Integrations";

    if (pathname === base || pathname.startsWith(`${base}/`))
      return "Workspace";
  }

  return "Starbeam";
}

export default function PortalTopbar({
  user,
  activeWorkspace,
  workspacesCount,
  onOpenNav,
  onOpenCommandPalette,
}: {
  user: ShellUser;
  activeWorkspace: ActiveWorkspace;
  workspacesCount: number;
  onOpenNav: () => void;
  onOpenCommandPalette: () => void;
}) {
  const pathname = usePathname() ?? "/";
  const label = sectionLabel(pathname, activeWorkspace);
  const settingsHref = activeWorkspace
    ? `/w/${activeWorkspace.slug}/settings`
    : null;

  return (
    <header className="sb-card px-4 py-3 sm:px-5 sm:py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            className={sbButtonClass({
              size: "icon",
              className: "lg:hidden",
            })}
            aria-label="Open navigation"
            onClick={onOpenNav}
          >
            <span aria-hidden className="text-lg leading-none">
              ≡
            </span>
          </button>

          <div className="min-w-0">
            <div className="text-xs text-[color:var(--sb-muted)] truncate">
              {activeWorkspace ? activeWorkspace.name : "Starbeam"}
            </div>
            <h1 className="sb-title text-lg font-extrabold leading-tight truncate">
              {label}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenCommandPalette}
            aria-label="Search (Cmd+K)"
            aria-keyshortcuts="Meta+K Control+K"
            className={sbButtonClass({
              variant: "secondary",
              className: "h-10 px-3 sm:px-4 text-xs font-semibold",
            })}
          >
            <IconSearch className="h-4 w-4" />
            <span className="hidden sm:inline">Search</span>
            <span className="hidden md:inline text-[11px] font-semibold text-[color:var(--sb-muted)]">
              Cmd+K
            </span>
          </button>

          <ProfileMenu
            email={user.email}
            settingsHref={settingsHref}
            showWorkspaces={workspacesCount > 1}
          />
        </div>
      </div>
    </header>
  );
}
