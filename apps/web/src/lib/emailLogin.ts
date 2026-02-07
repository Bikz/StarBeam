import crypto from "node:crypto";

export function generate6DigitCode(): string {
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function hashEmailLoginCode(args: {
  email: string;
  code: string;
  env: Record<string, string | undefined>;
}): string {
  // Pepper with AUTH_SECRET so a DB dump doesn't give reusable OTP material.
  const secret = args.env.AUTH_SECRET ?? args.env.NEXTAUTH_SECRET ?? "";
  const email = args.email.trim().toLowerCase();
  const code = args.code.trim();
  return sha256Hex(`${email}:${code}:${secret}`);
}
