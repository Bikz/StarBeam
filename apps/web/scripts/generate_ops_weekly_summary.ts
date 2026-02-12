import { promises as fs } from "node:fs";
import path from "node:path";

import {
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
  const programStatusFilter = parseProgramStatusFilter(argValue("programStatus"));

  const summary = await getOpsFunnelSummary({ windowDays, programStatusFilter });
  const stamp = summary.generatedAt.slice(0, 10);

  const md = `# PMF Signal Packet\nDate: ${summary.generatedAt}\nWindow: ${summary.windowDays}d\nProgram filter: ${programStatusFilter}\n\n## Activation\n- signedIn: ${summary.activation.signedIn}\n- googleConnected: ${summary.activation.googleConnected}\n- firstPulseQueued: ${summary.activation.firstPulseQueued}\n- firstPulseReady: ${summary.activation.firstPulseReady}\n- readyWithin24h: ${summary.activation.readyWithin24h}\n- readyWithin7d: ${summary.activation.readyWithin7d}\n\n## Retention\n- pulseViewedWeek1_1plus: ${summary.retention.pulseViewedWeek1_1plus}\n- pulseViewedWeek1_3plus: ${summary.retention.pulseViewedWeek1_3plus}\n- overviewSyncedWeek1_1plus: ${summary.retention.overviewSyncedWeek1_1plus}\n\n## Design Partners\n- prospectCount: ${summary.designPartners.prospectCount}\n- activeCount: ${summary.designPartners.activeCount}\n- churnedCount: ${summary.designPartners.churnedCount}\n\n## Partner Workspace Breakdown\n${summary.byWorkspace.length === 0 ? "- none" : summary.byWorkspace.map((row) => `- ${row.workspaceName} (${row.workspaceSlug}) · ${row.programStatus} · WAU ${row.weeklyActiveUsers} · firstPulseReadyUsers ${row.firstPulseReadyUsers} · googleConnectedUsers ${row.googleConnectedUsers}`).join("\n")}\n\n## Top Triage Categories (7d)\n${summary.feedback.topCategories7d.length === 0 ? "- none" : summary.feedback.topCategories7d.map((row) => `- ${row.category}: ${row.count}`).join("\n")}\n`;

  const docsDir = path.resolve(process.cwd(), "../../docs");
  await fs.mkdir(docsDir, { recursive: true });
  const outputPath = path.join(docsDir, `PMF_SIGNAL_PACKET_${stamp}.md`);
  await fs.writeFile(outputPath, md, "utf8");

  console.log(`Wrote ${outputPath}`);
}

await main();
