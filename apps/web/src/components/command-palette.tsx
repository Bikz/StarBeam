"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { sbButtonClass } from "@starbeam/shared";

import type { ActiveWorkspace, ShellWorkspace } from "@/components/app-shell";
import { runNightlyNow } from "@/actions/run-nightly-now";
import { IconSearch } from "@/components/sb-icons";
import { useUiMode } from "@/components/ui-mode";

type Item = {
  id: string;
  section: string;
  label: string;
  keywords: string;
  perform: () => void;
};

function isManageRole(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.getAttribute("aria-hidden") !== "true");
}

export default function CommandPalette({
  onClose,
  workspaces,
  activeWorkspace,
}: {
  onClose: () => void;
  workspaces: ShellWorkspace[];
  activeWorkspace: ActiveWorkspace;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const { mode } = useUiMode();
  const advanced = mode === "advanced";
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const items = useMemo(() => {
    const wsItems: Item[] = workspaces.map((w) => ({
      id: `ws:${w.slug}`,
      section: "Workspaces",
      label: w.name,
      keywords: `${w.slug} ${w.type} ${w.role}`,
      perform: () => {
        router.push(`/w/${w.slug}`);
        onClose();
      },
    }));

    const global: Item[] = [
      {
        id: "nav:dashboard",
        section: "Navigate",
        label: "Dashboard",
        keywords: "home overview",
        perform: () => {
          router.push("/dashboard");
          onClose();
        },
      },
      {
        id: "nav:workspaces",
        section: "Navigate",
        label: "All workspaces",
        keywords: "switcher org personal",
        perform: () => {
          router.push("/workspaces");
          onClose();
        },
      },
      {
        id: "nav:feedback",
        section: "Navigate",
        label: "Send feedback",
        keywords: "bug idea",
        perform: () => {
          router.push(`/feedback?path=${encodeURIComponent(pathname)}`);
          onClose();
        },
      },
    ];

    const w = activeWorkspace;
    const workspaceNav: Item[] = w
      ? [
          {
            id: "nav:pulse",
            section: "Workspace",
            label: "Pulse",
            keywords: "latest edition cards sources",
            perform: () => {
              router.push(`/w/${w.slug}/pulse`);
              onClose();
            },
          },
          {
            id: "nav:profile",
            section: "Workspace",
            label: "Profile",
            keywords: "context company description",
            perform: () => {
              router.push(`/w/${w.slug}/profile`);
              onClose();
            },
          },
          {
            id: "nav:goals",
            section: "Workspace",
            label: "Goals",
            keywords: "goals tracks departments",
            perform: () => {
              router.push(`/w/${w.slug}/tracks`);
              onClose();
            },
          },
          {
            id: "nav:integrations",
            section: "Workspace",
            label: "Integrations",
            keywords: "google github linear notion",
            perform: () => {
              router.push(`/w/${w.slug}/integrations`);
              onClose();
            },
          },
          {
            id: "nav:people",
            section: "Workspace",
            label: "People",
            keywords: "members invites",
            perform: () => {
              router.push(`/w/${w.slug}/members`);
              onClose();
            },
          },
          {
            id: "nav:settings",
            section: "Workspace",
            label: "Settings",
            keywords: "setup tools advanced",
            perform: () => {
              router.push(`/w/${w.slug}/settings`);
              onClose();
            },
          },
        ]
      : [];

    if (w && advanced && isManageRole(w.role)) {
      workspaceNav.push(
        {
          id: "nav:announcements",
          section: "Workspace",
          label: "Announcements",
          keywords: "pinned updates",
          perform: () => {
            router.push(`/w/${w.slug}/announcements`);
            onClose();
          },
        },
        {
          id: "nav:runs",
          section: "Workspace",
          label: "Runs",
          keywords: "jobs nightly history",
          perform: () => {
            router.push(`/w/${w.slug}/jobs`);
            onClose();
          },
        },
      );
    }

    const actions: Item[] =
      w && advanced && isManageRole(w.role)
        ? [
            {
              id: "act:run",
              section: "Actions",
              label: pending
                ? "Run overnight now (working…)"
                : "Run overnight now",
              keywords: "nightly generate pulse",
              perform: () => {
                setError("");
                startTransition(() => {
                  void runNightlyNow(w.slug).catch((err) => {
                    const msg =
                      err instanceof Error
                        ? err.message
                        : "Failed to run overnight";
                    setError(msg);
                  });
                });
              },
            },
            {
              id: "act:invite",
              section: "Actions",
              label: "Invite member",
              keywords: "people members",
              perform: () => {
                router.push(`/w/${w.slug}/members`);
                onClose();
              },
            },
            {
              id: "act:goal",
              section: "Actions",
              label: "Add goal",
              keywords: "track goals",
              perform: () => {
                router.push(`/w/${w.slug}/tracks`);
                onClose();
              },
            },
          ]
        : [];

    return [...actions, ...global, ...workspaceNav, ...wsItems];
  }, [
    activeWorkspace,
    advanced,
    onClose,
    pathname,
    pending,
    router,
    workspaces,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => {
      const hay = `${i.label} ${i.keywords}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  const grouped = useMemo(() => {
    const out = new Map<string, Item[]>();
    for (const i of filtered) {
      const list = out.get(i.section) ?? [];
      list.push(i);
      out.set(i.section, list);
    }
    return Array.from(out.entries());
  }, [filtered]);

  useEffect(() => {
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const els = focusables(panel);
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      document.documentElement.style.overflow = prev;
      const el = restoreFocusRef.current;
      restoreFocusRef.current = null;
      el?.focus?.();
    };
  }, [onClose]);

  const flat = filtered;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 bg-black/30 dark:bg-black/70"
        aria-label="Close command palette"
        onClick={onClose}
      />

      <div className="absolute inset-0 grid place-items-center p-4">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          tabIndex={-1}
          className="sb-card w-full max-w-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="sb-card-inset grid h-10 w-10 place-items-center">
              <IconSearch className="h-5 w-5 text-[color:var(--sb-muted)]" />
            </div>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
                setError("");
              }}
              placeholder="Search workspaces, pages, actions…"
              className="sb-input flex-1"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.min(flat.length - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIndex((i) => Math.max(0, i - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const item = flat[activeIndex];
                  item?.perform();
                }
              }}
            />
          </div>

          {error ? (
            <div className="mt-3 sb-alert">
              <strong>Error:</strong> {error}
            </div>
          ) : null}

          <div className="mt-4 grid gap-4">
            {grouped.length === 0 ? (
              <div className="sb-alert">No matches.</div>
            ) : (
              grouped.map(([section, sectionItems]) => (
                <div key={section}>
                  <div className="px-1 text-[11px] font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                    {section}
                  </div>
                  <div className="mt-2 grid gap-1">
                    {sectionItems.map((it) => {
                      const idx = flat.findIndex((x) => x.id === it.id);
                      const active = idx === activeIndex;
                      return (
                        <button
                          key={it.id}
                          type="button"
                          onMouseEnter={() => {
                            if (idx >= 0) setActiveIndex(idx);
                          }}
                          onClick={() => it.perform()}
                          className={[
                            "sb-card-inset px-4 py-3 text-left text-sm",
                            "hover:border-black/10 hover:bg-black/[0.03] dark:hover:border-white/15 dark:hover:bg-white/[0.06]",
                            "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sb-ring)]",
                            active
                              ? "border-black/10 dark:border-white/20 bg-black/5 dark:bg-white/10"
                              : "",
                          ].join(" ")}
                        >
                          <div className="font-semibold text-[color:var(--sb-fg)] truncate">
                            {it.label}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[color:var(--sb-muted)]">
            <div>
              Tip: use{" "}
              <span className="font-semibold text-[color:var(--sb-fg)]">
                Arrow keys
              </span>{" "}
              and{" "}
              <span className="font-semibold text-[color:var(--sb-fg)]">
                Enter
              </span>
              .
            </div>
            <button
              type="button"
              className={sbButtonClass({
                variant: "secondary",
                className: "h-9 px-4 text-xs font-semibold",
              })}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
