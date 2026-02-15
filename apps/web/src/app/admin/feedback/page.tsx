import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import { updateFeedbackTriage } from "@/app/admin/feedback/actions";
import { isAdminEmail } from "@/lib/admin";
import { authOptions } from "@/lib/auth";

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

function parseDefectLinkKey(note: string | null | undefined): string | null {
  const text = (note ?? "").trim();
  if (!text) return null;
  const match = /(?:^|\s)(DEFECT:[A-Z0-9._-]+)/i.exec(text);
  if (!match) return null;
  return match[1]?.toUpperCase() ?? null;
}

const triageStatusOptions = [
  "ALL",
  "NEW",
  "REVIEWED",
  "ACTIONED",
  "WONT_FIX",
] as const;
const categoryOptions = [
  "ALL",
  "NOISE",
  "MISSING_CONTEXT",
  "WRONG_PRIORITY",
  "LOW_CONFIDENCE",
  "OTHER",
] as const;

export default async function FeedbackAdminPage({
  searchParams,
}: {
  searchParams?: Promise<{
    source?: string;
    triageStatus?: string;
    category?: string;
    updated?: string;
    error?: string;
  }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdminEmail(session.user.email))
    redirect("/login");

  const sp = (await searchParams) ?? {};
  const source = typeof sp.source === "string" ? sp.source.trim() : "";
  const triageStatusRaw =
    typeof sp.triageStatus === "string"
      ? sp.triageStatus.trim().toUpperCase()
      : "ALL";
  const triageStatus = triageStatusOptions.includes(
    triageStatusRaw as (typeof triageStatusOptions)[number],
  )
    ? (triageStatusRaw as (typeof triageStatusOptions)[number])
    : "ALL";

  const categoryRaw =
    typeof sp.category === "string" ? sp.category.trim().toUpperCase() : "ALL";
  const category = categoryOptions.includes(
    categoryRaw as (typeof categoryOptions)[number],
  )
    ? (categoryRaw as (typeof categoryOptions)[number])
    : "ALL";

  const updated = sp.updated === "1";
  const error = typeof sp.error === "string" ? sp.error : "";

  const items = await prisma.feedback.findMany({
    where: {
      ...(source ? { source } : {}),
      ...(triageStatus !== "ALL" ? { triageStatus } : {}),
      ...(category !== "ALL" ? { category } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 150,
    include: {
      triagedBy: { select: { email: true } },
    },
  });

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="sb-card p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="sb-title text-2xl">Feedback inbox</div>
              <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
                Latest feedback submissions with triage classification.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/admin/feedback"
                className={sbButtonClass({
                  variant: !source ? "primary" : "secondary",
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
                href="/admin/ops/funnel"
                className={sbButtonClass({
                  variant: "secondary",
                  className: "h-10 px-4 text-xs font-semibold",
                })}
              >
                Ops funnel
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
            </div>
          </div>

          {updated ? (
            <div className="mt-6 sb-alert">Triage updated.</div>
          ) : null}
          {error ? (
            <div className="mt-6 sb-alert">
              <strong>Error:</strong> {error}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="sb-card-inset p-4">
              <div className="text-xs font-semibold text-[color:var(--sb-muted)]">
                Status filter
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {triageStatusOptions.map((opt) => (
                  <Link
                    key={opt}
                    href={`/admin/feedback?${new URLSearchParams({
                      ...(source ? { source } : {}),
                      ...(category !== "ALL" ? { category } : {}),
                      ...(opt === "ALL" ? {} : { triageStatus: opt }),
                    }).toString()}`}
                    className={sbButtonClass({
                      variant: triageStatus === opt ? "primary" : "secondary",
                      className: "h-9 px-3 text-[11px] font-semibold",
                    })}
                  >
                    {opt}
                  </Link>
                ))}
              </div>
            </div>

            <div className="sb-card-inset p-4">
              <div className="text-xs font-semibold text-[color:var(--sb-muted)]">
                Category filter
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {categoryOptions.map((opt) => (
                  <Link
                    key={opt}
                    href={`/admin/feedback?${new URLSearchParams({
                      ...(source ? { source } : {}),
                      ...(triageStatus !== "ALL" ? { triageStatus } : {}),
                      ...(opt === "ALL" ? {} : { category: opt }),
                    }).toString()}`}
                    className={sbButtonClass({
                      variant: category === opt ? "primary" : "secondary",
                      className: "h-9 px-3 text-[11px] font-semibold",
                    })}
                  >
                    {opt}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 sb-card-inset p-4">
            <div className="text-xs font-semibold text-[color:var(--sb-muted)]">
              Defect linking convention
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[color:var(--sb-muted)]">
              Include a defect reference in triage notes as{" "}
              <code>DEFECT:&lt;id&gt;</code> (example:{" "}
              <code>DEFECT:ACTIVATION-102</code>) so feedback items map cleanly
              to tracked defects.
            </p>
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
                    {(() => {
                      const defectKey = parseDefectLinkKey(f.triageNote);
                      return defectKey ? (
                        <div className="mb-3 inline-flex rounded-full border border-[color:var(--sb-border)] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-[color:var(--sb-muted)]">
                          Linked defect: {defectKey}
                        </div>
                      ) : null;
                    })()}
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

                    <form
                      action={updateFeedbackTriage}
                      className="mt-4 grid gap-2 md:grid-cols-4"
                    >
                      <input type="hidden" name="feedbackId" value={f.id} />

                      <label className="text-xs text-[color:var(--sb-muted)] grid gap-1">
                        Category
                        <select
                          name="category"
                          defaultValue={f.category ?? ""}
                          className="sb-input h-10 text-sm"
                        >
                          <option value="">(none)</option>
                          <option value="NOISE">NOISE</option>
                          <option value="MISSING_CONTEXT">
                            MISSING_CONTEXT
                          </option>
                          <option value="WRONG_PRIORITY">WRONG_PRIORITY</option>
                          <option value="LOW_CONFIDENCE">LOW_CONFIDENCE</option>
                          <option value="OTHER">OTHER</option>
                        </select>
                      </label>

                      <label className="text-xs text-[color:var(--sb-muted)] grid gap-1">
                        Triage status
                        <select
                          name="triageStatus"
                          defaultValue={f.triageStatus}
                          className="sb-input h-10 text-sm"
                        >
                          <option value="NEW">NEW</option>
                          <option value="REVIEWED">REVIEWED</option>
                          <option value="ACTIONED">ACTIONED</option>
                          <option value="WONT_FIX">WONT_FIX</option>
                        </select>
                      </label>

                      <label className="text-xs text-[color:var(--sb-muted)] grid gap-1 md:col-span-2">
                        Triage note
                        <input
                          type="text"
                          name="triageNote"
                          defaultValue={f.triageNote}
                          placeholder="What changed or why no action (optionally DEFECT:<id>)"
                          className="sb-input h-10 text-sm"
                        />
                      </label>

                      <div className="md:col-span-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-[color:var(--sb-muted)]">
                          Status: {f.triageStatus.toLowerCase()} · Category:{" "}
                          {f.category?.toLowerCase() ?? "none"}
                          {f.triagedAt
                            ? ` · Triaged at ${f.triagedAt.toISOString()}`
                            : ""}
                          {f.triagedBy?.email
                            ? ` · by ${f.triagedBy.email}`
                            : ""}
                        </div>
                        <button
                          type="submit"
                          className={sbButtonClass({
                            variant: "secondary",
                            className: "h-9 px-4 text-xs font-semibold",
                          })}
                        >
                          Save triage
                        </button>
                      </div>
                    </form>
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
