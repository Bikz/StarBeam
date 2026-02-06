import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";
import ThemeToggle from "@/components/theme-toggle";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/");

  const { slug } = await params;

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug } },
    include: { workspace: true },
  });
  if (!membership) notFound();

  const base = `/w/${membership.workspace.slug}`;

  const nav = [
    // IA: make Pulse the home, keep "context levers" split, move Jobs under Advanced.
    { href: base, label: "Setup" },
    { href: `${base}/pulse`, label: "Pulse" },
    { href: `${base}/profile`, label: "Org Profile" },
    { href: `${base}/goals`, label: "Goals" },
    { href: `${base}/announcements`, label: "Announcements" },
    { href: `${base}/departments`, label: "Tracks" },
    { href: `${base}/members`, label: "People" },
    { href: `${base}/google`, label: "Integrations" },
    { href: `${base}/jobs`, label: "Advanced" },
  ];

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="sb-title text-3xl">{membership.workspace.name}</div>
            <div className="mt-1 text-sm text-[color:var(--sb-muted)]">
              Slug:{" "}
              <span className="font-semibold text-[color:var(--sb-fg)]">
                {membership.workspace.slug}
              </span>{" "}
              | Role:{" "}
              <span className="font-semibold text-[color:var(--sb-fg)]">
                {membership.role.toLowerCase()}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
            <Link
              href="/dashboard"
              className="sb-btn inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[color:var(--sb-fg)]"
              aria-label="Back to dashboard"
            >
              <span aria-hidden>←</span>
              Dashboard
            </Link>
          </div>
        </div>

        <nav className="mt-7 flex flex-wrap gap-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="sb-btn px-4 py-2 text-xs font-semibold"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
