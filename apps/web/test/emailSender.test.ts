import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";

type SendEmail = (payload: {
  to: string;
  subject: string;
  text: string;
}) => Promise<void>;

async function importSendEmail(): Promise<SendEmail> {
  const url = new URL("../src/lib/emailSender.ts", import.meta.url);
  url.searchParams.set("t", String(Date.now()));
  const mod = (await import(url.href)) as { sendEmail?: unknown };
  if (typeof mod.sendEmail !== "function") {
    throw new Error("sendEmail export not found");
  }
  return mod.sendEmail as SendEmail;
}

test("sendEmail logs only safe telemetry when RESEND_API_KEY is missing", async () => {
  const oldEnv = {
    SMTP_HOST: process.env.SMTP_HOST,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  };
  delete process.env.SMTP_HOST;
  delete process.env.RESEND_API_KEY;

  const warns: unknown[][] = [];
  const oldWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warns.push(args);
  };

  try {
    const sendEmail = await importSendEmail();
    await sendEmail({
      to: "alice@example.com",
      subject: "Your Starbeam code",
      text: "Your code is 123456. Do not share it.",
    });
  } finally {
    console.warn = oldWarn;
    process.env.SMTP_HOST = oldEnv.SMTP_HOST;
    process.env.RESEND_API_KEY = oldEnv.RESEND_API_KEY;
  }

  assert.equal(warns.length, 1);
  const [message, telemetry] = warns[0] ?? [];
  assert.equal(message, "[email] RESEND_API_KEY missing; not sending email");

  const text = JSON.stringify(warns[0]);
  assert.equal(text.includes("123456"), false);
  assert.equal(text.includes("Do not share it."), false);
  assert.equal(text.includes("alice@"), false);

  assert.equal(
    (telemetry as { containsOtpLikeCode?: unknown }).containsOtpLikeCode,
    true,
  );
  assert.equal((telemetry as { toDomain?: unknown }).toDomain, "example.com");
});
