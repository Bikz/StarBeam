-- Insight quality 10x upgrades:
-- - persona submodes
-- - discovered skill candidate/execution traces
-- - server-side insight action state
-- - additive insight delivery metadata for skill origin/lift

CREATE TYPE "PersonaSubmode" AS ENUM (
  'SHIP_HEAVY',
  'GTM_HEAVY',
  'ALIGNMENT_GAP',
  'EXECUTION_DRIFT',
  'UNKNOWN'
);

CREATE TYPE "InsightActionStateValue" AS ENUM ('OPEN', 'DONE', 'DISMISSED');

ALTER TABLE "InsightDelivery"
  ADD COLUMN "personaSubmode" "PersonaSubmode" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "skillOrigin" TEXT,
  ADD COLUMN "expectedHelpfulLift" DOUBLE PRECISION,
  ADD COLUMN "expectedActionLift" DOUBLE PRECISION;

CREATE INDEX "InsightDelivery_personaSubmode_createdAt_idx"
  ON "InsightDelivery"("personaSubmode", "createdAt");

CREATE TABLE "InsightActionState" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "editionDate" TIMESTAMP(3) NOT NULL,
  "cardId" TEXT NOT NULL,
  "state" "InsightActionStateValue" NOT NULL DEFAULT 'OPEN',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InsightActionState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InsightActionState_workspaceId_userId_editionDate_cardId_key"
  ON "InsightActionState"("workspaceId", "userId", "editionDate", "cardId");
CREATE INDEX "InsightActionState_workspaceId_createdAt_idx"
  ON "InsightActionState"("workspaceId", "createdAt");
CREATE INDEX "InsightActionState_userId_createdAt_idx"
  ON "InsightActionState"("userId", "createdAt");
CREATE INDEX "InsightActionState_cardId_createdAt_idx"
  ON "InsightActionState"("cardId", "createdAt");

ALTER TABLE "InsightActionState"
  ADD CONSTRAINT "InsightActionState_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InsightActionState"
  ADD CONSTRAINT "InsightActionState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SkillCandidate" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "runId" TEXT,
  "personaTrack" "PersonaTrack" NOT NULL DEFAULT 'UNKNOWN',
  "personaSubmode" "PersonaSubmode" NOT NULL DEFAULT 'UNKNOWN',
  "skillRef" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "fitReason" TEXT NOT NULL,
  "risk" TEXT NOT NULL,
  "decision" TEXT NOT NULL DEFAULT 'PENDING',
  "expectedHelpfulLift" DOUBLE PRECISION,
  "expectedActionLift" DOUBLE PRECISION,
  "confidence" DOUBLE PRECISION,
  "evaluatorMetadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SkillCandidate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SkillCandidate_workspaceId_createdAt_idx"
  ON "SkillCandidate"("workspaceId", "createdAt");
CREATE INDEX "SkillCandidate_personaTrack_createdAt_idx"
  ON "SkillCandidate"("personaTrack", "createdAt");
CREATE INDEX "SkillCandidate_personaSubmode_createdAt_idx"
  ON "SkillCandidate"("personaSubmode", "createdAt");
CREATE INDEX "SkillCandidate_skillRef_createdAt_idx"
  ON "SkillCandidate"("skillRef", "createdAt");

ALTER TABLE "SkillCandidate"
  ADD CONSTRAINT "SkillCandidate_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SkillCandidate"
  ADD CONSTRAINT "SkillCandidate_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SkillCandidate"
  ADD CONSTRAINT "SkillCandidate_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "JobRun"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SkillExecutionTrace" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "runId" TEXT,
  "cardId" TEXT,
  "personaTrack" "PersonaTrack" NOT NULL DEFAULT 'UNKNOWN',
  "personaSubmode" "PersonaSubmode" NOT NULL DEFAULT 'UNKNOWN',
  "skillRef" TEXT NOT NULL,
  "skillOrigin" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "reason" TEXT,
  "expectedHelpfulLift" DOUBLE PRECISION,
  "expectedActionLift" DOUBLE PRECISION,
  "confidence" DOUBLE PRECISION,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SkillExecutionTrace_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SkillExecutionTrace_workspaceId_createdAt_idx"
  ON "SkillExecutionTrace"("workspaceId", "createdAt");
CREATE INDEX "SkillExecutionTrace_personaTrack_createdAt_idx"
  ON "SkillExecutionTrace"("personaTrack", "createdAt");
CREATE INDEX "SkillExecutionTrace_personaSubmode_createdAt_idx"
  ON "SkillExecutionTrace"("personaSubmode", "createdAt");
CREATE INDEX "SkillExecutionTrace_skillRef_createdAt_idx"
  ON "SkillExecutionTrace"("skillRef", "createdAt");
CREATE INDEX "SkillExecutionTrace_cardId_createdAt_idx"
  ON "SkillExecutionTrace"("cardId", "createdAt");

ALTER TABLE "SkillExecutionTrace"
  ADD CONSTRAINT "SkillExecutionTrace_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SkillExecutionTrace"
  ADD CONSTRAINT "SkillExecutionTrace_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SkillExecutionTrace"
  ADD CONSTRAINT "SkillExecutionTrace_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "JobRun"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
