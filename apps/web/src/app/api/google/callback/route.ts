import { prisma } from "@starbeam/db";
import { encryptString, parseAes256GcmKeyFromEnv } from "@starbeam/shared";
import { NextResponse } from "next/server";

import {
  enqueueAutoFirstNightlyWorkspaceRun,
  enqueueWorkspaceBootstrap,
} from "@/lib/nightlyRunQueue";
import { parseSignedState } from "@/lib/signedState";
import { recordUsageEventSafe } from "@/lib/usageEvents";
import { webOrigin } from "@/lib/webOrigin";

function googleConnectErrorCode(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  if (!message) return "connect_failed";
  if (message.includes("Missing GOOGLE_CLIENT_ID")) return "misconfigured";
  if (message.includes("Missing GOOGLE_CLIENT_SECRET")) return "misconfigured";
  if (message.startsWith("Google token exchange failed")) return "oauth_failed";
  if (message.startsWith("Google userinfo failed")) return "userinfo_failed";
  if (message === "Google userinfo missing email") return "userinfo_failed";
  return "connect_failed";
}

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
  } catch {
    return NextResponse.redirect(
      `${webOrigin()}/dashboard?error=invalid_state`,
    );
  }

  const origin = webOrigin();
  const redirectUri = `${origin}/api/google/callback`;

  try {
    // Validate membership before exchanging tokens or persisting connection data.
    const membership = await prisma.membership.findFirst({
      where: {
        userId: parsedState.userId,
        workspaceId: parsedState.workspaceId,
      },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.redirect(`${webOrigin()}/dashboard?error=not_member`);
    }

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

    await recordUsageEventSafe({
      eventType: "GOOGLE_CONNECTED",
      source: "web",
      workspaceId: parsedState.workspaceId,
      userId: parsedState.userId,
      metadata: {
        workspaceSlug: parsedState.workspaceSlug,
        accountEmail: email,
      },
    });

    try {
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

        await recordUsageEventSafe({
          eventType: "FIRST_PULSE_QUEUED",
          source: "web",
          workspaceId: parsedState.workspaceId,
          userId: parsedState.userId,
          metadata: {
            triggeredBy: "google_connect_callback",
          },
        });
      }
    } catch {
      // Don't block Google connect on queue availability.
    }

    const redirectUrl = parsedState.next
      ? new URL(parsedState.next, webOrigin())
      : new URL(`/w/${parsedState.workspaceSlug}/integrations`, webOrigin());
    redirectUrl.searchParams.set("connected", "google");
    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    const code = googleConnectErrorCode(err);
    const redirectUrl = parsedState.next
      ? new URL(parsedState.next, webOrigin())
      : new URL(`/w/${parsedState.workspaceSlug}/integrations`, webOrigin());
    redirectUrl.searchParams.set("error", code);
    return NextResponse.redirect(redirectUrl.toString());
  }
}
