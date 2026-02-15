import { promises as fs } from "node:fs";
import path from "node:path";

import {
  getOpsInsightsSummary,
  getOpsFunnelSummary,
  parseProgramStatusFilter,
  parseWindowDays,
} from "../src/lib/opsFunnel";

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

async function main() {
  const windowDays = parseWindowDays(argValue("windowDays"));
  const programStatusFilter = parseProgramStatusFilter(
    argValue("programStatus"),
  );

  const [summary, insights] = await Promise.all([
    getOpsFunnelSummary({ windowDays, programStatusFilter }),
    getOpsInsightsSummary({ windowDays }),
  ]);
  const stamp = summary.generatedAt.slice(0, 10);

  const md = `# PMF Signal Packet\nDate: ${summary.generatedAt}\nWindow: ${summary.windowDays}d\nProgram filter: ${programStatusFilter}\n\n## Activation\n- chainCoveragePct: ${summary.chainCoveragePct.toFixed(1)}\n- signedIn: ${summary.activation.signedIn}\n- googleConnected: ${summary.activation.googleConnected}\n- firstPulseQueued: ${summary.activation.firstPulseQueued}\n- firstPulseReady: ${summary.activation.firstPulseReady}\n- readyWithin24h: ${summary.activation.readyWithin24h}\n- readyWithin7d: ${summary.activation.readyWithin7d}\n\n## Insight Quality (7d)\n- helpfulRatePct: ${summary.insightQuality.helpfulRatePct7d.toFixed(1)}\n- notHelpfulRatePct: ${summary.insightQuality.notHelpfulRatePct7d.toFixed(1)}\n- actionCompletionRatePct: ${summary.insightQuality.actionCompletionRatePct7d.toFixed(1)}\n\n## Runner Health\n- p95DurationSec: ${insights.runner.p95DurationSec}\n- retryRatePct: ${insights.runner.retryRatePct.toFixed(1)}\n- fallbackRatePct: ${insights.runner.fallbackRatePct.toFixed(1)}\n- avgInputTokens: ${insights.runner.avgInputTokens}\n- avgOutputTokens: ${insights.runner.avgOutputTokens}\n\n## Discovered Skill Runner\n- executedCount: ${insights.discoveredSkillRunner.executedCount}\n- skippedByEvaluatorCount: ${insights.discoveredSkillRunner.skippedByEvaluatorCount}\n- helpfulLiftPct: ${insights.discoveredSkillRunner.helpfulLiftPct.toFixed(1)}\n- actionLiftPct: ${insights.discoveredSkillRunner.actionLiftPct.toFixed(1)}\n- discoveredSkillExecutionEnabled: ${insights.manualControls.discoveredSkillExecutionEnabled ? "true" : "false"}\n\n## Activation Backlog (24h)\n- connectedNoPulse24h: ${summary.activationBacklog.connectedNoPulse24h}\n- failedBlocking24h: ${summary.activationBacklog.failedBlocking24h}\n- failedRetriable24h: ${summary.activationBacklog.failedRetriable24h}\n- queuedOrRunningStale24h: ${summary.activationBacklog.queuedOrRunningStale24h}\n\n## Retention\n- pulseViewedWeek1_1plus: ${summary.retention.pulseViewedWeek1_1plus}\n- pulseViewedWeek1_3plus: ${summary.retention.pulseViewedWeek1_3plus}\n- overviewSyncedWeek1_1plus: ${summary.retention.overviewSyncedWeek1_1plus}\n\n## Design Partners\n- prospectCount: ${summary.designPartners.prospectCount}\n- activeCount: ${summary.designPartners.activeCount}\n- churnedCount: ${summary.designPartners.churnedCount}\n\n## Partner Workspace Breakdown\n${summary.byWorkspace.length === 0 ? "- none" : summary.byWorkspace.map((row) => `- ${row.workspaceName} (${row.workspaceSlug}) · ${row.programStatus} · WAU ${row.weeklyActiveUsers} · firstPulseReadyUsers ${row.firstPulseReadyUsers} · googleConnectedUsers ${row.googleConnectedUsers}`).join("\\n")}\n\n## Persona Quality Breakdown\n${insights.byPersona.length === 0 ? "- none" : insights.byPersona.map((row) => `- ${row.personaTrack}: deliveries ${row.deliveryCount} · helpful ${row.helpfulRatePct.toFixed(1)}% · notHelpful ${row.notHelpfulRatePct.toFixed(1)}% · actionCompletion ${row.actionCompletionRatePct.toFixed(1)}%`).join("\\n")}\n\n## Submode Quality Breakdown\n${insights.bySubmode.length === 0 ? "- none" : insights.bySubmode.map((row) => `- ${row.personaSubmode}: deliveries ${row.deliveryCount} · helpful ${row.helpfulRatePct.toFixed(1)}% · notHelpful ${row.notHelpfulRatePct.toFixed(1)}% · actionCompletion ${row.actionCompletionRatePct.toFixed(1)}%`).join("\\n")}\n\n## Skill Quality Breakdown\n${
    insights.bySkill.length === 0
      ? "- none"
      : insights.bySkill
          .slice(0, 10)
          .map(
            (row) =>
              `- ${row.skillRef}: deliveries ${row.deliveryCount} · helpful ${row.helpfulRatePct.toFixed(1)}% · notHelpful ${row.notHelpfulRatePct.toFixed(1)}% · actionCompletion ${row.actionCompletionRatePct.toFixed(1)}%`,
          )
          .join("\\n")
  }\n\n## Top Activation Failure Reasons (24h)\n${summary.activationBacklog.topFailureReasons.length === 0 ? "- none" : summary.activationBacklog.topFailureReasons.map((row) => `- ${row.reason}: ${row.count}`).join("\\n")}\n\n## Top Triage Categories (7d)\n${summary.feedback.topCategories7d.length === 0 ? "- none" : summary.feedback.topCategories7d.map((row) => `- ${row.category}: ${row.count}`).join("\\n")}\n`;

  const docsDir = path.resolve(process.cwd(), "../../docs");
  await fs.mkdir(docsDir, { recursive: true });
  const outputPath = path.join(docsDir, `PMF_SIGNAL_PACKET_${stamp}.md`);
  await fs.writeFile(outputPath, md, "utf8");

  console.log(`Wrote ${outputPath}`);
}

await main();
