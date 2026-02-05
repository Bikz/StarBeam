export default function WorkspacePage() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="sb-card p-7">
        <div className="sb-title text-xl">Demo narrative</div>
        <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
          Manager sets a Marketing goal and a pinned announcement, then triggers
          a nightly run. Employee sees a cited web insight and a few focus tasks
          in the macOS menu bar app.
        </p>
      </div>
      <div className="sb-card p-7">
        <div className="sb-title text-xl">Status</div>
        <div className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
          This workspace is being wired up: departments, goals, announcements,
          then Google connections and jobs.
        </div>
      </div>
    </div>
  );
}
