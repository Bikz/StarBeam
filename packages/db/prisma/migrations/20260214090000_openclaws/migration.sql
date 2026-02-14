-- OpenClaws (Starbeam x OpenClaw) foundation:
-- - OpenClaw agents + command queue + event log
-- - Extend device auth + refresh tokens with client metadata

CREATE TYPE "ApiClientKind" AS ENUM ('MACOS', 'OPENCLAW');

CREATE TYPE "OpenClawAgentMode" AS ENUM ('BRIEF', 'AUTOPILOT');
CREATE TYPE "OpenClawAgentStatus" AS ENUM ('ONLINE', 'OFFLINE');
CREATE TYPE "OpenClawCommandType" AS ENUM ('DELIVER_BRIEF', 'RUN_TASK');
CREATE TYPE "OpenClawCommandState" AS ENUM (
  'PENDING',
  'LEASED',
  'ACKED',
  'DONE',
  'DISMISSED',
  'FAILED'
);
CREATE TYPE "OpenClawEventKind" AS ENUM (
  'HEARTBEAT',
  'COMMAND_ACK',
  'COMMAND_RESULT',
  'TASK_STATE',
  'LOG'
);

CREATE TABLE "OpenClawAgent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "roleTitle" TEXT,
  "responsibilities" TEXT,
  "mode" "OpenClawAgentMode" NOT NULL DEFAULT 'BRIEF',
  "status" "OpenClawAgentStatus" NOT NULL DEFAULT 'OFFLINE',
  "lastSeenAt" TIMESTAMP(3),
  "connectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OpenClawAgent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OpenClawAgent_workspaceId_idx" ON "OpenClawAgent"("workspaceId");
CREATE INDEX "OpenClawAgent_createdByUserId_idx" ON "OpenClawAgent"("createdByUserId");
CREATE INDEX "OpenClawAgent_status_idx" ON "OpenClawAgent"("status");
CREATE INDEX "OpenClawAgent_lastSeenAt_idx" ON "OpenClawAgent"("lastSeenAt");

ALTER TABLE "OpenClawAgent"
  ADD CONSTRAINT "OpenClawAgent_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OpenClawAgent"
  ADD CONSTRAINT "OpenClawAgent_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OpenClawCommand" (
  "id" TEXT NOT NULL,
  "openclawAgentId" TEXT NOT NULL,
  "type" "OpenClawCommandType" NOT NULL,
  "state" "OpenClawCommandState" NOT NULL DEFAULT 'PENDING',
  "leaseId" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "leasedAt" TIMESTAMP(3),
  "ackedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "payload" JSONB NOT NULL,
  "result" JSONB,
  "errorSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OpenClawCommand_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OpenClawCommand_openclawAgentId_createdAt_idx"
  ON "OpenClawCommand"("openclawAgentId", "createdAt");
CREATE INDEX "OpenClawCommand_state_leaseExpiresAt_idx"
  ON "OpenClawCommand"("state", "leaseExpiresAt");
CREATE INDEX "OpenClawCommand_leaseExpiresAt_idx"
  ON "OpenClawCommand"("leaseExpiresAt");

ALTER TABLE "OpenClawCommand"
  ADD CONSTRAINT "OpenClawCommand_openclawAgentId_fkey"
  FOREIGN KEY ("openclawAgentId") REFERENCES "OpenClawAgent"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OpenClawEvent" (
  "id" TEXT NOT NULL,
  "openclawAgentId" TEXT NOT NULL,
  "commandId" TEXT,
  "kind" "OpenClawEventKind" NOT NULL,
  "leaseId" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OpenClawEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OpenClawEvent_openclawAgentId_createdAt_idx"
  ON "OpenClawEvent"("openclawAgentId", "createdAt");
CREATE INDEX "OpenClawEvent_commandId_createdAt_idx"
  ON "OpenClawEvent"("commandId", "createdAt");
CREATE INDEX "OpenClawEvent_kind_createdAt_idx"
  ON "OpenClawEvent"("kind", "createdAt");

ALTER TABLE "OpenClawEvent"
  ADD CONSTRAINT "OpenClawEvent_openclawAgentId_fkey"
  FOREIGN KEY ("openclawAgentId") REFERENCES "OpenClawAgent"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OpenClawEvent"
  ADD CONSTRAINT "OpenClawEvent_commandId_fkey"
  FOREIGN KEY ("commandId") REFERENCES "OpenClawCommand"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeviceAuthRequest"
  ADD COLUMN "clientKind" "ApiClientKind" NOT NULL DEFAULT 'MACOS',
  ADD COLUMN "workspaceId" TEXT,
  ADD COLUMN "openclawAgentId" TEXT;

CREATE INDEX "DeviceAuthRequest_clientKind_idx" ON "DeviceAuthRequest"("clientKind");
CREATE INDEX "DeviceAuthRequest_workspaceId_idx" ON "DeviceAuthRequest"("workspaceId");
CREATE INDEX "DeviceAuthRequest_openclawAgentId_idx" ON "DeviceAuthRequest"("openclawAgentId");

ALTER TABLE "DeviceAuthRequest"
  ADD CONSTRAINT "DeviceAuthRequest_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeviceAuthRequest"
  ADD CONSTRAINT "DeviceAuthRequest_openclawAgentId_fkey"
  FOREIGN KEY ("openclawAgentId") REFERENCES "OpenClawAgent"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApiRefreshToken"
  ADD COLUMN "clientKind" "ApiClientKind" NOT NULL DEFAULT 'MACOS',
  ADD COLUMN "workspaceId" TEXT,
  ADD COLUMN "openclawAgentId" TEXT;

CREATE INDEX "ApiRefreshToken_clientKind_idx" ON "ApiRefreshToken"("clientKind");
CREATE INDEX "ApiRefreshToken_workspaceId_idx" ON "ApiRefreshToken"("workspaceId");
CREATE INDEX "ApiRefreshToken_openclawAgentId_idx" ON "ApiRefreshToken"("openclawAgentId");

ALTER TABLE "ApiRefreshToken"
  ADD CONSTRAINT "ApiRefreshToken_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApiRefreshToken"
  ADD CONSTRAINT "ApiRefreshToken_openclawAgentId_fkey"
  FOREIGN KEY ("openclawAgentId") REFERENCES "OpenClawAgent"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

