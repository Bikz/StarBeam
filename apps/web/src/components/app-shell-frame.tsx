"use client";

import { useState } from "react";

import type { ActiveWorkspace, ShellUser, ShellWorkspace } from "@/components/app-shell";
import PortalTopbar from "@/components/portal-topbar";
import Sidebar from "@/components/sidebar";
import SidebarDrawer from "@/components/sidebar-drawer";

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
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <div className="flex items-start gap-6">
        <aside className="hidden lg:block w-72 shrink-0 sticky top-6">
          <Sidebar
            user={user}
            workspaces={workspaces}
            activeWorkspace={activeWorkspace}
            variant="desktop"
            onNavigate={() => setDrawerOpen(false)}
          />
        </aside>

        <div className="min-w-0 flex-1">
          <PortalTopbar
            user={user}
            activeWorkspace={activeWorkspace}
            onOpenNav={() => setDrawerOpen(true)}
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
    </div>
  );
}

