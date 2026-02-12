import { timingSafeEqual } from "node:crypto";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { authOptions } from "@/lib/auth";
import {
  getOpsFunnelSummary,
  parseProgramStatusFilter,
  parseWindowDays,
} from "@/lib/opsFunnel";

function parseBearerToken(value: string | null): string | null {
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  const token = match?.[1]?.trim() ?? "";
  return token || null;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

async function hasOpsAccess(request: Request): Promise<boolean> {
  const staticToken = (process.env.STARB_OPS_METRICS_TOKEN ?? "").trim();
  if (staticToken) {
    const incoming = parseBearerToken(request.headers.get("authorization"));
    if (incoming && safeEqual(incoming, staticToken)) return true;
  }

  const session = await getServerSession(authOptions);
  return Boolean(session?.user?.email && isAdminEmail(session.user.email));
}

function csvEscape(value: string): string {
  if (!value.includes('"') && !value.includes(",") && !value.includes("\n")) {
    return value;
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function toCsv(summary: Awaited<ReturnType<typeof getOpsFunnelSummary>>): string {
  const lines: string[] = ["metric,value"];

  const scalarMetrics: Array<[string, number | string]> = [
    ["windowDays", summary.windowDays],
    ["activation.signedIn", summary.activation.signedIn],
    ["activation.googleConnected", summary.activation.googleConnected],
    ["activation.firstPulseQueued", summary.activation.firstPulseQueued],
    ["activation.firstPulseReady", summary.activation.firstPulseReady],
    ["activation.readyWithin24h", summary.activation.readyWithin24h],
    ["activation.readyWithin7d", summary.activation.readyWithin7d],
    ["retention.pulseViewedWeek1_1plus", summary.retention.pulseViewedWeek1_1plus],
    ["retention.pulseViewedWeek1_3plus", summary.retention.pulseViewedWeek1_3plus],
    [
      "retention.overviewSyncedWeek1_1plus",
      summary.retention.overviewSyncedWeek1_1plus,
    ],
    ["designPartners.prospectCount", summary.designPartners.prospectCount],
    ["designPartners.activeCount", summary.designPartners.activeCount],
    ["designPartners.churnedCount", summary.designPartners.churnedCount],
  ];

  for (const [metric, value] of scalarMetrics) {
    lines.push(`${csvEscape(metric)},${csvEscape(String(value))}`);
  }

  lines.push("");
  lines.push(
    [
      "workspaceSlug",
      "workspaceName",
      "programStatus",
      "programStartedAt",
      "programEndedAt",
      "googleConnectedUsers",
      "firstPulseReadyUsers",
      "weeklyActiveUsers",
    ].join(","),
  );

  for (const row of summary.byWorkspace) {
    lines.push(
      [
        csvEscape(row.workspaceSlug),
        csvEscape(row.workspaceName),
        csvEscape(row.programStatus),
        csvEscape(row.programStartedAt ?? ""),
        csvEscape(row.programEndedAt ?? ""),
        csvEscape(String(row.googleConnectedUsers)),
        csvEscape(String(row.firstPulseReadyUsers)),
        csvEscape(String(row.weeklyActiveUsers)),
      ].join(","),
    );
  }

  lines.push("");
  lines.push("feedbackCategory,count");
  for (const row of summary.feedback.topCategories7d) {
    lines.push(`${csvEscape(row.category)},${csvEscape(String(row.count))}`);
  }

  return lines.join("\n");
}

export async function GET(request: Request) {
  const allowed = await hasOpsAccess(request);
  if (!allowed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const windowDays = parseWindowDays(url.searchParams.get("windowDays"));
  const programStatusFilter = parseProgramStatusFilter(
    url.searchParams.get("programStatus"),
  );
  const format = (url.searchParams.get("format") ?? "csv").trim().toLowerCase();

  const summary = await getOpsFunnelSummary({ windowDays, programStatusFilter });
  const stamp = summary.generatedAt.slice(0, 10);

  if (format === "json") {
    return new NextResponse(JSON.stringify(summary, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename=ops-funnel-${windowDays}d-${stamp}.json`,
      },
    });
  }

  const csv = toCsv(summary);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename=ops-funnel-${windowDays}d-${stamp}.csv`,
    },
  });
}
