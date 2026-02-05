import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";

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
    { href: base, label: "Overview" },
    { href: `${base}/profile`, label: "Profile" },
    { href: `${base}/members`, label: "Members" },
    { href: `${base}/departments`, label: "Departments" },
    { href: `${base}/goals`, label: "Goals" },
    { href: `${base}/announcements`, label: "Announcements" },
    { href: `${base}/jobs`, label: "Jobs" },
  ];

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-5xl px-6 py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
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
          <Link
            href="/dashboard"
            className="text-sm text-[color:var(--sb-muted)] hover:text-[color:var(--sb-fg)] transition-colors"
          >
            &lt;- Dashboard
          </Link>
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
          <button
            type="button"
            className="sb-btn px-4 py-2 text-xs font-semibold"
            disabled
            title="Integrations land next"
          >
            Google (next)
          </button>
        </nav>

        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
