import {
  decryptString,
  encryptString,
  parseAes256GcmKeyFromEnv,
} from "@starbeam/shared";

type TokenRefreshResponse = {
  access_token: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

function requireGoogleEnv(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  if (!clientId) throw new Error("Missing GOOGLE_CLIENT_ID");
  if (!clientSecret) throw new Error("Missing GOOGLE_CLIENT_SECRET");
  return { clientId, clientSecret };
}

function encKey(): Buffer {
  return parseAes256GcmKeyFromEnv("STARB_TOKEN_ENC_KEY_B64");
}

export function decryptToken(enc: string): string {
  return decryptString(enc, encKey());
}

export function encryptToken(plaintext: string): string {
  return encryptString(plaintext, encKey());
}

export function isExpired(expiryAt: Date | null, skewSeconds = 60): boolean {
  if (!expiryAt) return true;
  return expiryAt.getTime() <= Date.now() + skewSeconds * 1000;
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresIn?: number;
  scope?: string;
}> {
  const { clientId, clientSecret } = requireGoogleEnv();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Google refresh failed (${resp.status}): ${text}`);
  }

  const parsed = JSON.parse(text) as TokenRefreshResponse;
  if (!parsed?.access_token)
    throw new Error("Google refresh missing access_token");

  return {
    accessToken: parsed.access_token,
    expiresIn: parsed.expires_in,
    scope: parsed.scope,
  };
}
