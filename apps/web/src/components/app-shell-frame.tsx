"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import type { ActiveWorkspace, ShellUser, ShellWorkspace } from "@/components/app-shell";
import CommandPalette from "@/components/command-palette";
import PortalTopbar from "@/components/portal-topbar";
import Sidebar from "@/components/sidebar";
import SidebarDrawer from "@/components/sidebar-drawer";
import SearchParamToasts from "@/components/search-param-toasts";
import ToastProvider from "@/components/toast-provider";
import { UiModeProvider } from "@/components/ui-mode";

export default function AppShellFrame({
  user,
  workspaces,
  activeWorkspace,
  children,
}: {
  user: ShellUser;
  workspaces: ShellWorkspace[];
  activeWorkspace: ActiveWorkspace;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paletteForPath, setPaletteForPath] = useState<string | null>(null);
  const paletteOpen = paletteForPath === pathname;
  const workspaceSlug = activeWorkspace?.slug ?? "global";

  useEffect(() => {
    const raw = window.localStorage.getItem("sb_sidebar_collapsed");
    if (raw !== "1") return;
    const t = window.setTimeout(() => setSidebarCollapsed(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = (e.key ?? "").toLowerCase();
      if (key !== "k") return;
      if (!e.metaKey && !e.ctrlKey) return;
      e.preventDefault();
      setPaletteForPath(pathname);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pathname]);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("sb_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  };

  return (
    <ToastProvider>
      <UiModeProvider key={workspaceSlug} workspaceSlug={workspaceSlug}>
        <SearchParamToasts />
        <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
          <div className="flex items-start gap-6">
            <aside
              className={[
                "hidden lg:block shrink-0 sticky top-6",
                sidebarCollapsed ? "w-20" : "w-64",
              ].join(" ")}
            >
              <Sidebar
                user={user}
                workspaces={workspaces}
                activeWorkspace={activeWorkspace}
                variant="desktop"
                collapsed={sidebarCollapsed}
                onToggleCollapsed={toggleSidebarCollapsed}
                onNavigate={() => setDrawerOpen(false)}
              />
            </aside>

            <div className="min-w-0 flex-1">
              <PortalTopbar
                user={user}
                activeWorkspace={activeWorkspace}
                onOpenNav={() => setDrawerOpen(true)}
                onOpenCommandPalette={() => setPaletteForPath(pathname)}
              />

              <main id="main" className="mt-5 min-w-0">
                {children}
              </main>
            </div>
          </div>

          <SidebarDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
            <Sidebar
              user={user}
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
              variant="drawer"
              onNavigate={() => setDrawerOpen(false)}
            />
          </SidebarDrawer>

          {paletteOpen ? (
            <CommandPalette
              onClose={() => setPaletteForPath(null)}
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
            />
          ) : null}
        </div>
      </UiModeProvider>
    </ToastProvider>
  );
}
