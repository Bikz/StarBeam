-- Insight quality telemetry foundation (persona + delivery + interactions).

CREATE TYPE "PersonaTrack" AS ENUM ('SOLO_FOUNDER', 'SMALL_TEAM_5_10', 'GROWTH_TEAM_11_50', 'UNKNOWN');
CREATE TYPE "InsightInteractionType" AS ENUM ('VIEWED', 'SOURCE_OPENED', 'COPIED', 'MARKED_DONE', 'HELPFUL', 'NOT_HELPFUL');

CREATE TABLE "InsightDelivery" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "editionId" TEXT,
  "cardId" TEXT NOT NULL,
  "cardKind" TEXT NOT NULL,
  "personaTrack" "PersonaTrack" NOT NULL DEFAULT 'UNKNOWN',
  "skillRef" TEXT,
  "relevanceScore" DOUBLE PRECISION,
  "actionabilityScore" DOUBLE PRECISION,
  "confidenceScore" DOUBLE PRECISION,
  "noveltyScore" DOUBLE PRECISION,
  "modelSource" TEXT NOT NULL DEFAULT 'local_codex',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InsightDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InsightInteraction" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "editionDate" TIMESTAMP(3),
  "cardId" TEXT NOT NULL,
  "interactionType" "InsightInteractionType" NOT NULL,
  "reasonCode" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InsightInteraction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InsightDelivery_workspaceId_createdAt_idx" ON "InsightDelivery"("workspaceId", "createdAt");
CREATE INDEX "InsightDelivery_userId_createdAt_idx" ON "InsightDelivery"("userId", "createdAt");
CREATE INDEX "InsightDelivery_personaTrack_createdAt_idx" ON "InsightDelivery"("personaTrack", "createdAt");
CREATE INDEX "InsightDelivery_skillRef_createdAt_idx" ON "InsightDelivery"("skillRef", "createdAt");
CREATE INDEX "InsightDelivery_editionId_idx" ON "InsightDelivery"("editionId");
CREATE INDEX "InsightDelivery_cardId_createdAt_idx" ON "InsightDelivery"("cardId", "createdAt");

CREATE INDEX "InsightInteraction_workspaceId_createdAt_idx" ON "InsightInteraction"("workspaceId", "createdAt");
CREATE INDEX "InsightInteraction_userId_createdAt_idx" ON "InsightInteraction"("userId", "createdAt");
CREATE INDEX "InsightInteraction_interactionType_createdAt_idx" ON "InsightInteraction"("interactionType", "createdAt");
CREATE INDEX "InsightInteraction_cardId_createdAt_idx" ON "InsightInteraction"("cardId", "createdAt");

ALTER TABLE "InsightDelivery"
  ADD CONSTRAINT "InsightDelivery_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InsightDelivery"
  ADD CONSTRAINT "InsightDelivery_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InsightDelivery"
  ADD CONSTRAINT "InsightDelivery_editionId_fkey"
  FOREIGN KEY ("editionId") REFERENCES "PulseEdition"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InsightInteraction"
  ADD CONSTRAINT "InsightInteraction_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InsightInteraction"
  ADD CONSTRAINT "InsightInteraction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
