import crypto from "node:crypto";

import { requireAuthSecret } from "@/lib/authSecret";

type SignedState = {
  v: 1;
  userId: string;
  workspaceId: string;
  workspaceSlug: string;
  nonce: string;
  next?: string;
  iat: number; // seconds
};

function sanitizeNext(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!trimmed.startsWith("/")) return undefined;
  if (!trimmed.startsWith("/w/")) return undefined;
  if (!trimmed.includes("/onboarding")) return undefined;
  if (trimmed.length > 512) return undefined;
  return trimmed;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}

function base64urlToBuffer(input: string): Buffer {
  const padded = input.replaceAll("-", "+").replaceAll("_", "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const withPad = padded + "=".repeat(padLen);
  return Buffer.from(withPad, "base64");
}

function hmacSha256(secret: string, data: string): string {
  return base64url(crypto.createHmac("sha256", secret).update(data).digest());
}

export function mintSignedState(input: Omit<SignedState, "v" | "iat">): string {
  const { next: rawNext, ...rest } = input;
  const next = sanitizeNext(rawNext);
  const payload: SignedState = {
    v: 1,
    iat: Math.floor(Date.now() / 1000),
    ...rest,
    ...(next ? { next } : {}),
  };
  const payloadB64 = base64url(JSON.stringify(payload));
  const sig = hmacSha256(requireAuthSecret(), payloadB64);
  return `${payloadB64}.${sig}`;
}

export function parseSignedState(token: string): SignedState {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) throw new Error("Invalid state");

  const expected = hmacSha256(requireAuthSecret(), payloadB64);
  // Constant-time compare.
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid state signature");
  }

  const payloadJson = base64urlToBuffer(payloadB64).toString("utf8");
  const parsed = JSON.parse(payloadJson) as SignedState;
  if (parsed?.v !== 1) throw new Error("Invalid state version");
  if (
    !parsed.userId ||
    !parsed.workspaceId ||
    !parsed.workspaceSlug ||
    !parsed.nonce
  ) {
    throw new Error("Invalid state payload");
  }

  const now = Math.floor(Date.now() / 1000);
  // 20 minute window.
  if (typeof parsed.iat !== "number" || now - parsed.iat > 20 * 60) {
    throw new Error("State expired");
  }

  const { next: rawNext, ...rest } = parsed as SignedState;
  const next = sanitizeNext(rawNext);
  return { ...rest, ...(next ? { next } : {}) };
}
