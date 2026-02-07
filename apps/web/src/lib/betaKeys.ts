import crypto from "node:crypto";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function normalizeBetaKey(input: string): string {
  return input.trim();
}

export function hashBetaKey(code: string): string {
  return sha256Hex(normalizeBetaKey(code));
}

export function generateBetaKeyCode(): string {
  // Shareable, URL-safe.
  return crypto.randomBytes(18).toString("base64url");
}

