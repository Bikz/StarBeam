import TimezoneReporter from "@/components/timezone-reporter";
import AppShellFrame from "@/components/app-shell-frame";

export type ShellWorkspace = {
  slug: string;
  name: string;
  type: string;
  role: string;
};

export type ShellUser = {
  email: string;
};

export type ActiveWorkspace = {
  slug: string;
  name: string;
  role: string;
} | null;

export default function AppShell({
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
  return (
    <div className="sb-bg">
      <a href="#main" className="sb-skip-link">
        Skip to content
      </a>
      <TimezoneReporter />
      <AppShellFrame
        user={user}
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
      >
        {children}
      </AppShellFrame>
    </div>
  );
}

