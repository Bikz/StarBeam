-- Add lightweight product telemetry events for activation and retention funneling.

CREATE TYPE "UsageEventType" AS ENUM (
  'SIGNED_IN',
  'GOOGLE_CONNECTED',
  'FIRST_PULSE_QUEUED',
  'FIRST_PULSE_READY',
  'PULSE_VIEWED_WEB',
  'OVERVIEW_SYNCED_MACOS',
  'INVITE_ACCEPTED'
);

CREATE TABLE "UsageEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "userId" TEXT,
  "eventType" "UsageEventType" NOT NULL,
  "source" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UsageEvent_eventType_createdAt_idx" ON "UsageEvent"("eventType", "createdAt");
CREATE INDEX "UsageEvent_workspaceId_createdAt_idx" ON "UsageEvent"("workspaceId", "createdAt");
CREATE INDEX "UsageEvent_userId_createdAt_idx" ON "UsageEvent"("userId", "createdAt");

ALTER TABLE "UsageEvent"
  ADD CONSTRAINT "UsageEvent_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UsageEvent"
  ADD CONSTRAINT "UsageEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
