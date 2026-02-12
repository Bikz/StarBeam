-- Add design partner workspace program tracking + feedback triage fields.

CREATE TYPE "WorkspaceProgramType" AS ENUM ('NONE', 'DESIGN_PARTNER');
CREATE TYPE "WorkspaceProgramStatus" AS ENUM ('NONE', 'PROSPECT', 'ACTIVE', 'CHURNED');
CREATE TYPE "FeedbackCategory" AS ENUM ('NOISE', 'MISSING_CONTEXT', 'WRONG_PRIORITY', 'LOW_CONFIDENCE', 'OTHER');
CREATE TYPE "FeedbackTriageStatus" AS ENUM ('NEW', 'REVIEWED', 'ACTIONED', 'WONT_FIX');

ALTER TABLE "Workspace"
  ADD COLUMN "programType" "WorkspaceProgramType" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "programStatus" "WorkspaceProgramStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "programStartedAt" TIMESTAMP(3),
  ADD COLUMN "programEndedAt" TIMESTAMP(3),
  ADD COLUMN "programNotes" TEXT NOT NULL DEFAULT '';

CREATE INDEX "Workspace_programType_programStatus_idx" ON "Workspace"("programType", "programStatus");

ALTER TABLE "Feedback"
  ADD COLUMN "triagedByUserId" TEXT,
  ADD COLUMN "category" "FeedbackCategory",
  ADD COLUMN "triageStatus" "FeedbackTriageStatus" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "triageNote" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "triagedAt" TIMESTAMP(3);

CREATE INDEX "Feedback_triagedByUserId_idx" ON "Feedback"("triagedByUserId");
CREATE INDEX "Feedback_triageStatus_createdAt_idx" ON "Feedback"("triageStatus", "createdAt");
CREATE INDEX "Feedback_category_createdAt_idx" ON "Feedback"("category", "createdAt");

ALTER TABLE "Feedback"
  ADD CONSTRAINT "Feedback_triagedByUserId_fkey"
  FOREIGN KEY ("triagedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
