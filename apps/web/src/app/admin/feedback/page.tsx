import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

export default async function FeedbackAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdminEmail(session.user.email)) redirect("/login");

  const items = await prisma.feedback.findMany({
    orderBy: { createdAt: "desc" },
    take: 120,
  });

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="sb-card p-8">
          <div className="sb-title text-2xl">Feedback inbox</div>
          <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            Latest feedback submissions from beta users.
          </p>

          <div className="mt-8">
            {items.length === 0 ? (
              <div className="text-sm text-[color:var(--sb-muted)]">No feedback yet.</div>
            ) : (
              <div className="grid gap-3">
                {items.map((f) => (
                  <div
                    key={f.id}
                    className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/30 dark:bg-white/5 p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-[color:var(--sb-fg)]">
                        {f.email || f.userId || "unknown"}
                      </div>
                      <div className="text-xs text-[color:var(--sb-muted)]">
                        {f.createdAt.toISOString()} · {f.source || "web"}
                        {f.path ? ` · ${f.path}` : ""}
                      </div>
                    </div>
                    <div className="mt-3 whitespace-pre-wrap text-sm text-[color:var(--sb-fg)]">
                      {f.message}
                    </div>
                    {f.userAgent ? (
                      <div className="mt-3 text-[11px] text-[color:var(--sb-muted)] break-all">
                        UA: {f.userAgent}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

