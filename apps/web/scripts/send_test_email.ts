import process from "node:process";
import path from "node:path";

import dotenv from "dotenv";

import { sendEmail } from "../src/lib/emailSender";

// When running `pnpm -C apps/web …`, Next doesn't automatically load the repo root .env files.
dotenv.config({ path: path.resolve(process.cwd(), "../../.env.local") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

function usage(): never {
  console.error(
    [
      "Usage:",
      "  pnpm -C apps/web email:test -- --to you@example.com",
      "",
      "Optional:",
      '  --subject "Test"',
      '  --text "Hello"',
    ].join("\n"),
  );
  process.exit(2);
}

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const to = argValue("--to");
  if (!to) usage();

  const subject = argValue("--subject") ?? "Starbeam SMTP test";
  const text =
    argValue("--text") ??
    [
      "This is a Starbeam test email.",
      "",
      "If you received this, SMTP is configured correctly.",
      "",
      `Sent at: ${new Date().toISOString()}`,
    ].join("\n");

  await sendEmail({ to, subject, text });
  console.log("Sent.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
