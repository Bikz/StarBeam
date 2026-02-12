import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

function parsePulseCardFeedback(message: string): {
  workspaceSlug: string;
  editionDateIso: string;
  cardKind: string;
  cardTitle: string;
  rating: "up" | "down";
} | null {
  try {
    const parsed = JSON.parse(message) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.type !== "pulse_card_feedback") return null;

    const workspaceSlug =
      typeof obj.workspaceSlug === "string" ? obj.workspaceSlug : "";
    const editionDateIso =
      typeof obj.editionDateIso === "string" ? obj.editionDateIso : "";
    const cardKind = typeof obj.cardKind === "string" ? obj.cardKind : "";
    const cardTitle = typeof obj.cardTitle === "string" ? obj.cardTitle : "";
    const rating =
      obj.rating === "up" || obj.rating === "down" ? obj.rating : null;

    if (!workspaceSlug || !editionDateIso || !cardKind || !rating) return null;
    return { workspaceSlug, editionDateIso, cardKind, cardTitle, rating };
  } catch {
    return null;
  }
}

export default async function FeedbackAdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ source?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdminEmail(session.user.email))
    redirect("/login");

  const sp = (await searchParams) ?? {};
  const source = typeof sp.source === "string" ? sp.source.trim() : "";

  const items = await prisma.feedback.findMany({
    where: source ? { source } : {},
    orderBy: { createdAt: "desc" },
    take: 120,
  });

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="sb-card p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="sb-title text-2xl">Feedback inbox</div>
              <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                Latest feedback submissions from beta users.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/admin/feedback"
                className={sbButtonClass({
                  variant: source ? "secondary" : "primary",
                  className: "h-10 px-4 text-xs font-semibold",
                })}
              >
                All
              </Link>
              <Link
                href="/admin/feedback?source=pulse-card"
                className={sbButtonClass({
                  variant: source === "pulse-card" ? "primary" : "secondary",
                  className: "h-10 px-4 text-xs font-semibold",
                })}
              >
                Pulse card
              </Link>
              <Link
                href="/admin/waitlist"
                className={sbButtonClass({
                  variant: "secondary",
                  className: "h-10 px-4 text-xs font-semibold",
                })}
              >
                Waitlist
              </Link>
              <Link
                href="/admin/beta-keys"
                className={sbButtonClass({
                  variant: "secondary",
                  className: "h-10 px-4 text-xs font-semibold",
                })}
              >
                Beta keys
              </Link>
            </div>
          </div>

          <div className="mt-8">
            {items.length === 0 ? (
              <div className="text-sm text-[color:var(--sb-muted)]">
                No feedback yet.
              </div>
            ) : (
              <div className="grid gap-3">
                {items.map((f) => (
                  <div key={f.id} className="sb-card-inset p-5">
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
                      {(() => {
                        if (f.source !== "pulse-card") return f.message;
                        const parsed = parsePulseCardFeedback(f.message);
                        if (!parsed) return f.message;

                        const label =
                          parsed.rating === "up" ? "Helpful" : "Not helpful";
                        const title = parsed.cardTitle
                          ? ` — ${parsed.cardTitle}`
                          : "";
                        return `Pulse card feedback: ${label} · ${parsed.cardKind} · ${parsed.workspaceSlug} · ${parsed.editionDateIso}${title}`;
                      })()}
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
