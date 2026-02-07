"use client";

import { usePathname } from "next/navigation";
import type { ActiveWorkspace, ShellUser } from "@/components/app-shell";

function sectionLabel(pathname: string, activeWorkspace: ActiveWorkspace): string {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname.startsWith("/feedback")) return "Feedback";
  if (pathname.startsWith("/admin")) return "Admin";

  if (activeWorkspace) {
    const base = `/w/${activeWorkspace.slug}`;
    const map: Array<{ label: string; href: string }> = [
      { label: "Setup", href: `${base}/onboarding` },
      { label: "Pulse", href: `${base}/pulse` },
      { label: "Tracks", href: `${base}/tracks` },
      { label: "Announcements", href: `${base}/announcements` },
      { label: "People", href: `${base}/members` },
      { label: "Integrations", href: `${base}/integrations` },
      { label: "Runs", href: `${base}/jobs` },
    ];

    const match = map.find((m) => pathname === m.href || pathname.startsWith(`${m.href}/`));
    if (match) return match.label;
    if (pathname === base || pathname.startsWith(`${base}/`)) return "Workspace";
  }

  return "Starbeam";
}

export default function PortalTopbar({
  user,
  activeWorkspace,
  onOpenNav,
}: {
  user: ShellUser;
  activeWorkspace: ActiveWorkspace;
  onOpenNav: () => void;
}) {
  const pathname = usePathname() ?? "/";
  const label = sectionLabel(pathname, activeWorkspace);

  return (
    <header className="sb-card px-4 py-3 sm:px-5 sm:py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            className="sb-btn inline-flex h-10 w-10 items-center justify-center lg:hidden"
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
            <div className="sb-title text-lg font-extrabold leading-tight truncate">
              {label}
            </div>
          </div>
        </div>

        <div className="hidden sm:block text-sm text-[color:var(--sb-muted)] truncate">
          Signed in as{" "}
          <span className="font-semibold text-[color:var(--sb-fg)]">
            {user.email}
          </span>
        </div>
      </div>
    </header>
  );
}

