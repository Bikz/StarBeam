import crypto from "node:crypto";

type AccessTokenPayload = {
  v: 1;
  sub: string; // userId
  iat: number; // seconds
  exp: number; // seconds
};

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

function requireSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Missing AUTH_SECRET");
  return secret;
}

function hmacSha256(secret: string, data: string): string {
  return base64url(crypto.createHmac("sha256", secret).update(data).digest());
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function mintAccessToken(args: { userId: string; ttlSeconds: number }): {
  token: string;
  expiresIn: number;
} {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessTokenPayload = {
    v: 1,
    sub: args.userId,
    iat: now,
    exp: now + args.ttlSeconds,
  };

  const payloadB64 = base64url(JSON.stringify(payload));
  const sig = hmacSha256(requireSecret(), payloadB64);
  return { token: `at1.${payloadB64}.${sig}`, expiresIn: args.ttlSeconds };
}

export function parseAccessToken(token: string): AccessTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "at1") {
    throw new Error("invalid_token");
  }

  const payloadB64 = parts[1] ?? "";
  const sig = parts[2] ?? "";
  if (!payloadB64 || !sig) throw new Error("invalid_token");

  const expected = hmacSha256(requireSecret(), payloadB64);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("invalid_token");
  }

  const payloadJson = base64urlToBuffer(payloadB64).toString("utf8");
  const payload = JSON.parse(payloadJson) as AccessTokenPayload;

  if (payload?.v !== 1 || typeof payload.sub !== "string") {
    throw new Error("invalid_token");
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) {
    throw new Error("token_expired");
  }

  return payload;
}

export function mintRefreshToken(): { refreshToken: string; tokenHash: string } {
  const refreshToken = base64url(crypto.randomBytes(32));
  const tokenHash = sha256Hex(refreshToken);
  return { refreshToken, tokenHash };
}

