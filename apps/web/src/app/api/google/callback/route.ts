import { prisma } from "@starbeam/db";
import { encryptString, parseAes256GcmKeyFromEnv } from "@starbeam/shared";
import { NextResponse } from "next/server";

import {
  enqueueAutoFirstNightlyWorkspaceRun,
  enqueueWorkspaceBootstrap,
} from "@/lib/nightlyRunQueue";
import { parseSignedState } from "@/lib/signedState";
import { webOrigin } from "@/lib/webOrigin";

function requireGoogleEnv(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId) throw new Error("Missing GOOGLE_CLIENT_ID");
  if (!clientSecret) throw new Error("Missing GOOGLE_CLIENT_SECRET");
  return { clientId, clientSecret };
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

async function exchangeCodeForTokens(args: {
  code: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const { clientId, clientSecret } = requireGoogleEnv();

  const body = new URLSearchParams({
    code: args.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: args.redirectUri,
    grant_type: "authorization_code",
  });

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Google token exchange failed (${resp.status}): ${text}`);
  }
  return JSON.parse(text) as TokenResponse;
}

async function fetchUserEmail(accessToken: string): Promise<string> {
  const resp = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Google userinfo failed (${resp.status}): ${text}`);
  }

  const parsed = JSON.parse(text) as { email?: unknown };
  const email = typeof parsed.email === "string" ? parsed.email : "";
  if (!email) throw new Error("Google userinfo missing email");
  return email.toLowerCase();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";

  if (!code || !state) {
    return NextResponse.redirect(`${webOrigin()}/dashboard?error=missing_code`);
  }

  let parsedState: ReturnType<typeof parseSignedState>;
  try {
    parsedState = parseSignedState(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid_state";
    return NextResponse.redirect(
      `${webOrigin()}/dashboard?error=${encodeURIComponent(message)}`,
    );
  }

  const origin = webOrigin();
  const redirectUri = `${origin}/api/google/callback`;

  try {
    const tokens = await exchangeCodeForTokens({ code, redirectUri });
    const email = await fetchUserEmail(tokens.access_token);

    const key = parseAes256GcmKeyFromEnv();
    const accessTokenEnc = encryptString(tokens.access_token, key);
    const refreshTokenEnc = tokens.refresh_token
      ? encryptString(tokens.refresh_token, key)
      : null;

    const expiryAt =
      typeof tokens.expires_in === "number"
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null;

    const scopes =
      typeof tokens.scope === "string" && tokens.scope.trim()
        ? tokens.scope.trim().split(/\s+/g)
        : [];

    await prisma.$transaction(async (tx) => {
      const existing = await tx.googleConnection.findFirst({
        where: {
          workspaceId: parsedState.workspaceId,
          ownerUserId: parsedState.userId,
          googleAccountEmail: email,
        },
      });

      if (existing) {
        await tx.googleConnection.update({
          where: { id: existing.id },
          data: {
            scopes,
            accessTokenEnc,
            refreshTokenEnc: refreshTokenEnc ?? existing.refreshTokenEnc,
            expiryAt,
            status: "CONNECTED",
          },
        });
      } else {
        await tx.googleConnection.create({
          data: {
            workspaceId: parsedState.workspaceId,
            ownerUserId: parsedState.userId,
            googleAccountEmail: email,
            scopes,
            accessTokenEnc,
            refreshTokenEnc,
            expiryAt,
            status: "CONNECTED",
            syncState: { create: {} },
          },
        });
      }
    });

    try {
      const membership = await prisma.membership.findFirst({
        where: {
          userId: parsedState.userId,
          workspaceId: parsedState.workspaceId,
        },
        select: { role: true },
      });

      if (membership) {
        const existingPulse = await prisma.pulseEdition.findFirst({
          where: {
            workspaceId: parsedState.workspaceId,
            userId: parsedState.userId,
          },
          select: { id: true },
        });

        if (!existingPulse) {
          await enqueueWorkspaceBootstrap({
            workspaceId: parsedState.workspaceId,
            userId: parsedState.userId,
            triggeredByUserId: parsedState.userId,
            source: "auto-first",
            runAt: new Date(),
            jobKeyMode: "replace",
          });

          await enqueueAutoFirstNightlyWorkspaceRun({
            workspaceId: parsedState.workspaceId,
            userId: parsedState.userId,
            triggeredByUserId: parsedState.userId,
            source: "auto-first",
            runAt: new Date(Date.now() + 10 * 60 * 1000),
            jobKeyMode: "preserve_run_at",
          });
        }
      }
    } catch {
      // Don't block Google connect on queue availability.
    }

    return NextResponse.redirect(
      `${webOrigin()}/w/${parsedState.workspaceSlug}/integrations?connected=google`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "connect_failed";
    return NextResponse.redirect(
      `${webOrigin()}/w/${parsedState.workspaceSlug}/integrations?error=${encodeURIComponent(message)}`,
    );
  }
}
