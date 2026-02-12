-- Add per-connection "last attempted" timestamps so polling can respect the
-- configured interval even when sync attempts fail (prevents hot loops).

ALTER TABLE "GoogleConnection" ADD COLUMN "lastAttemptedAt" TIMESTAMP(3);
ALTER TABLE "GitHubConnection" ADD COLUMN "lastAttemptedAt" TIMESTAMP(3);
ALTER TABLE "LinearConnection" ADD COLUMN "lastAttemptedAt" TIMESTAMP(3);
ALTER TABLE "NotionConnection" ADD COLUMN "lastAttemptedAt" TIMESTAMP(3);

CREATE INDEX "GoogleConnection_lastAttemptedAt_idx" ON "GoogleConnection"("lastAttemptedAt");
CREATE INDEX "GitHubConnection_lastAttemptedAt_idx" ON "GitHubConnection"("lastAttemptedAt");
CREATE INDEX "LinearConnection_lastAttemptedAt_idx" ON "LinearConnection"("lastAttemptedAt");
CREATE INDEX "NotionConnection_lastAttemptedAt_idx" ON "NotionConnection"("lastAttemptedAt");

