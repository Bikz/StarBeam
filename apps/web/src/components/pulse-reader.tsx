"use client";

/* eslint-disable @next/next/no-img-element -- Favicon from arbitrary domains; Next/Image would require remotePatterns. */

import { useEffect, useMemo, useRef, useState } from "react";
import { sbButtonClass } from "@starbeam/shared";

import { recordPulseViewed } from "@/actions/record-pulse-view";
import { submitPulseCardFeedback } from "@/actions/submit-pulse-card-feedback";
import { IconArrowUpRight, IconCheck, IconCopy } from "@/components/sb-icons";
import { useToast } from "@/components/toast-provider";

type Citation = { url: string; title?: string };

type PulseCard = {
  id: string;
  kind: string;
  title: string;
  body: string;
  why: string;
  action: string;
  priority: number;
  sources: unknown;
  createdAt: string;
};

function kindLabel(kind: string): string {
  if (kind === "ANNOUNCEMENT") return "Announcement";
  if (kind === "GOAL") return "Goal";
  if (kind === "WEB_RESEARCH") return "Web research";
  return "Internal";
}

function extractCitations(sources: unknown): Citation[] {
  if (!sources || typeof sources !== "object") return [];
  const obj = sources as Record<string, unknown>;
  const citations = obj.citations;
  if (!Array.isArray(citations)) return [];
  return citations
    .map((c) => {
      if (!c || typeof c !== "object") return null;
      const cc = c as Record<string, unknown>;
      const url = typeof cc.url === "string" ? cc.url : "";
      const title = typeof cc.title === "string" ? cc.title : undefined;
      if (!url) return null;
      return { url, ...(title ? { title } : {}) } satisfies Citation;
    })
    .filter((c): c is Citation => c !== null);
}

function hostnameFor(url: string): string {
  try {
    const host = new URL(url).hostname;
    return host.replace(/^www\\./, "");
  } catch {
    return "";
  }
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function relativeDay(d: Date, now: Date): string | null {
  const toKey = (x: Date) =>
    Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  const diffDays = Math.round((toKey(d) - toKey(now)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === -1) return "Yesterday";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 0) return `${Math.abs(diffDays)}d ago`;
  return `in ${diffDays}d`;
}

function storageKey(workspaceSlug: string, editionDateIso: string): string {
  const key = editionDateIso.slice(0, 10);
  return `sb_pulse_done:${workspaceSlug}:${key}`;
}

function readDoneSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  const raw = window.localStorage.getItem(key) ?? "";
  if (!raw.trim()) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    const ids = parsed.filter((x) => typeof x === "string") as string[];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

function writeDoneSet(key: string, set: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
}

function Favicon({ domain }: { domain: string }) {
  const [hidden, setHidden] = useState(false);
  const initial = (domain.trim()[0] ?? "").toUpperCase();

  if (!domain.trim() || hidden) {
    return (
      <span className="grid h-5 w-5 place-items-center rounded bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/15 text-[10px] font-extrabold text-[color:var(--sb-muted)]">
        {initial || "·"}
      </span>
    );
  }

  const src = `https://${domain}/favicon.ico`;
  return (
    // biome-ignore lint/performance/noImgElement: Tiny favicon; Next/Image would require remotePatterns for arbitrary domains.
    <img
      src={src}
      alt=""
      className="h-5 w-5 rounded border border-black/10 dark:border-white/15 bg-white"
      onError={() => setHidden(true)}
    />
  );
}

export default function PulseReader({
  workspaceSlug,
  edition,
  cards,
}: {
  workspaceSlug: string;
  edition: { editionDateIso: string; status: string };
  cards: PulseCard[];
}) {
  const editionDate = useMemo(
    () => new Date(edition.editionDateIso),
    [edition.editionDateIso],
  );
  const doneKey = useMemo(
    () => storageKey(workspaceSlug, edition.editionDateIso),
    [workspaceSlug, edition.editionDateIso],
  );

  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [feedback, setFeedback] = useState<Record<string, "up" | "down">>(
    () => ({}),
  );
  const [feedbackBusy, setFeedbackBusy] = useState<Record<string, boolean>>(
    () => ({}),
  );
  const { push } = useToast();
  const didTrackView = useRef(false);

  useEffect(() => {
    setDone(readDoneSet(doneKey));
  }, [doneKey]);

  useEffect(() => {
    if (didTrackView.current) return;
    didTrackView.current = true;
    void recordPulseViewed({
      workspaceSlug,
      editionDateIso: edition.editionDateIso,
      cardCount: cards.length,
    });
  }, [workspaceSlug, edition.editionDateIso, cards.length]);

  const now = new Date();
  const rel = relativeDay(editionDate, now);

  return (
    <section className="sb-card p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="sb-title text-xl font-extrabold">Pulse</h2>
          <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
            {formatDate(editionDate)}
            {rel ? ` · ${rel}` : ""} · status {edition.status.toLowerCase()}
          </div>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="mt-6 sb-alert">This edition has no cards yet.</div>
      ) : (
        <div className="mt-6 grid gap-3">
          {cards.map((c) => {
            const citations = extractCitations(c.sources);
            const isDone = done.has(c.id);
            const feedbackValue = feedback[c.id] ?? null;
            const busy = feedbackBusy[c.id] ?? false;

            const copyText = [
              c.title,
              c.body ? `\n\n${c.body}` : "",
              c.why ? `\n\nWhy: ${c.why}` : "",
              c.action ? `\n\nAction: ${c.action}` : "",
              citations.length
                ? `\n\nSources:\n${citations.map((s) => `- ${s.title ? `${s.title} - ` : ""}${s.url}`).join("\n")}`
                : "",
            ]
              .join("")
              .trim();

            return (
              <article
                key={c.id}
                className={[
                  "sb-card-inset p-5",
                  isDone ? "opacity-60" : "",
                ].join(" ")}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="sb-title text-lg leading-tight">
                      {c.title}
                    </h3>
                    <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
                      {kindLabel(c.kind)} · priority {c.priority}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="sb-pill">{c.kind}</div>
                    <button
                      type="button"
                      className={sbButtonClass({ className: "h-9 w-9" })}
                      aria-label="Copy card"
                      title="Copy"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(copyText)
                          .then(() =>
                            push({ kind: "success", title: "Copied" }),
                          )
                          .catch(() =>
                            push({
                              kind: "error",
                              title: "Copy failed",
                              message: "Your browser blocked clipboard access.",
                            }),
                          );
                      }}
                    >
                      <IconCopy className="h-4 w-4" />
                    </button>
                    {citations[0]?.url ? (
                      <button
                        type="button"
                        className={sbButtonClass({ className: "h-9 w-9" })}
                        aria-label="Open first source"
                        title="Open source"
                        onClick={() => {
                          const url = citations[0]?.url;
                          if (!url) return;
                          window.open(url, "_blank", "noreferrer");
                        }}
                      >
                        <IconArrowUpRight className="h-4 w-4" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={sbButtonClass({
                        className: [
                          "h-9 w-9",
                          isDone ? "border-black/15 dark:border-white/25" : "",
                        ].join(" "),
                      })}
                      aria-label={isDone ? "Mark not done" : "Mark done"}
                      title={isDone ? "Undo" : "Done"}
                      onClick={() => {
                        setDone((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.id)) next.delete(c.id);
                          else next.add(c.id);
                          writeDoneSet(doneKey, next);
                          return next;
                        });
                      }}
                    >
                      <IconCheck className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 max-w-[72ch]">
                  {c.body ? (
                    <div className="text-[15px] text-[color:var(--sb-muted)] leading-relaxed whitespace-pre-wrap">
                      {c.body}
                    </div>
                  ) : null}

                  {c.why ? (
                    <div className="text-[15px] text-[color:var(--sb-muted)] leading-relaxed whitespace-pre-wrap">
                      <span className="font-semibold text-[color:var(--sb-fg)]">
                        Why:
                      </span>{" "}
                      {c.why}
                    </div>
                  ) : null}

                  {c.action ? (
                    <div className="text-[15px] text-[color:var(--sb-muted)] leading-relaxed whitespace-pre-wrap">
                      <span className="font-semibold text-[color:var(--sb-fg)]">
                        Action:
                      </span>{" "}
                      {c.action}
                    </div>
                  ) : null}
                </div>

                {citations.length ? (
                  <div className="mt-4">
                    <div className="text-xs font-semibold text-[color:var(--sb-muted)]">
                      Sources
                    </div>
                    <div className="mt-2 grid gap-1">
                      {citations.slice(0, 4).map((s) => {
                        const domain = hostnameFor(s.url);
                        const title = (s.title ?? "").trim();
                        return (
                          <a
                            key={s.url}
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="sb-card-inset px-3 py-2 text-sm hover:underline"
                            title={s.url}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Favicon domain={domain} />
                              <span className="sb-pill">
                                {domain || "source"}
                              </span>
                              <span className="min-w-0 truncate font-semibold text-[color:var(--sb-fg)]">
                                {title || s.url}
                              </span>
                            </div>
                          </a>
                        );
                      })}
                      {citations.length > 4 ? (
                        <div className="text-xs text-[color:var(--sb-muted)]">
                          +{citations.length - 4} more sources
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-[color:var(--sb-muted)]">
                    Was this helpful?
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={sbButtonClass({
                        variant: "secondary",
                        className: "h-9 px-4 text-xs font-semibold",
                      })}
                      disabled={busy || Boolean(feedbackValue)}
                      aria-label="Mark card helpful"
                      onClick={() => {
                        if (busy || feedbackValue) return;
                        setFeedbackBusy((prev) => ({ ...prev, [c.id]: true }));
                        void submitPulseCardFeedback({
                          workspaceSlug,
                          editionDateIso: edition.editionDateIso,
                          cardId: c.id,
                          cardKind: c.kind,
                          cardTitle: c.title,
                          rating: "up",
                        })
                          .then(() => {
                            setFeedback((prev) => ({ ...prev, [c.id]: "up" }));
                            push({ kind: "success", title: "Thanks" });
                          })
                          .catch((err) => {
                            const msg =
                              err instanceof Error
                                ? err.message
                                : "Could not send feedback.";
                            push({
                              kind: "error",
                              title: "Feedback failed",
                              message: msg,
                            });
                          })
                          .finally(() => {
                            setFeedbackBusy((prev) => ({
                              ...prev,
                              [c.id]: false,
                            }));
                          });
                      }}
                    >
                      Helpful
                    </button>
                    <button
                      type="button"
                      className={sbButtonClass({
                        variant: "secondary",
                        className: "h-9 px-4 text-xs font-semibold",
                      })}
                      disabled={busy || Boolean(feedbackValue)}
                      aria-label="Mark card not helpful"
                      onClick={() => {
                        if (busy || feedbackValue) return;
                        setFeedbackBusy((prev) => ({ ...prev, [c.id]: true }));
                        void submitPulseCardFeedback({
                          workspaceSlug,
                          editionDateIso: edition.editionDateIso,
                          cardId: c.id,
                          cardKind: c.kind,
                          cardTitle: c.title,
                          rating: "down",
                        })
                          .then(() => {
                            setFeedback((prev) => ({
                              ...prev,
                              [c.id]: "down",
                            }));
                            push({ kind: "success", title: "Thanks" });
                          })
                          .catch((err) => {
                            const msg =
                              err instanceof Error
                                ? err.message
                                : "Could not send feedback.";
                            push({
                              kind: "error",
                              title: "Feedback failed",
                              message: msg,
                            });
                          })
                          .finally(() => {
                            setFeedbackBusy((prev) => ({
                              ...prev,
                              [c.id]: false,
                            }));
                          });
                      }}
                    >
                      Not helpful
                    </button>

                    {feedbackValue ? (
                      <span className="text-xs text-[color:var(--sb-muted)]">
                        Sent
                      </span>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
