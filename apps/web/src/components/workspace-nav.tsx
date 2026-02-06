"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type WorkspaceNavItem = {
  href: string;
  label: string;
  match?: "exact" | "prefix";
};

function isActivePathname(pathname: string, item: WorkspaceNavItem): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: WorkspaceNavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={[
        "sb-btn px-4 py-2 text-xs font-semibold",
        active ? "sb-btn-primary" : "",
      ].join(" ")}
    >
      {item.label}
    </Link>
  );
}

export default function WorkspaceNav({
  core,
  context,
  ops,
}: {
  core: WorkspaceNavItem[];
  context: WorkspaceNavItem[];
  ops: WorkspaceNavItem[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const moreItems = useMemo(() => [...context, ...ops], [context, ops]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!open) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  return (
    <nav className="mt-7">
      <div className="flex flex-wrap items-center gap-2 sm:hidden">
        {core.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActivePathname(pathname, item)}
            onNavigate={() => setOpen(false)}
          />
        ))}

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className={[
              "sb-btn px-4 py-2 text-xs font-semibold",
              open ? "sb-btn-primary" : "",
            ].join(" ")}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            More <span aria-hidden>▾</span>
          </button>

          {open ? (
            <div className="absolute left-0 z-20 mt-2 w-64 sb-card p-2">
              <div className="px-3 pb-2 pt-1 text-[11px] font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                Context
              </div>
              <div className="grid gap-1">
                {context.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={isActivePathname(pathname, item)}
                    onNavigate={() => setOpen(false)}
                  />
                ))}
              </div>

              <div className="my-2 h-px bg-[color:var(--sb-divider)]" />

              <div className="px-3 pb-2 pt-1 text-[11px] font-semibold tracking-wide uppercase text-[color:var(--sb-muted)]">
                Ops
              </div>
              <div className="grid gap-1">
                {ops.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={isActivePathname(pathname, item)}
                    onNavigate={() => setOpen(false)}
                  />
                ))}
              </div>

              {/* Subtle hint: if we ever add more groups, we can stack them here. */}
            </div>
          ) : null}
        </div>
      </div>

      <div className="hidden sm:flex flex-wrap items-center gap-2">
        <div className="sb-card-inset inline-flex flex-wrap items-center gap-1 p-1">
          {core.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActivePathname(pathname, item)}
            />
          ))}
        </div>

        <div className="sb-card-inset inline-flex flex-wrap items-center gap-1 p-1">
          {context.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActivePathname(pathname, item)}
            />
          ))}
        </div>

        <div className="sb-card-inset inline-flex flex-wrap items-center gap-1 p-1">
          {ops.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActivePathname(pathname, item)}
            />
          ))}
        </div>
      </div>

      {/* Preload the “More” routes on desktop by rendering them once offscreen. */}
      <div className="sr-only" aria-hidden>
        {moreItems.map((i) => (
          <Link key={i.href} href={i.href}>
            {i.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
