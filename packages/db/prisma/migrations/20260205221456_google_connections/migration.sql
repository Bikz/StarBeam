-- CreateEnum
CREATE TYPE "GoogleConnectionStatus" AS ENUM ('CONNECTED', 'REVOKED', 'ERROR');

-- CreateTable
CREATE TABLE "GoogleConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "googleAccountEmail" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "expiryAt" TIMESTAMP(3),
    "status" "GoogleConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleSyncState" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "lastGmailSyncAt" TIMESTAMP(3),
    "lastCalendarSyncAt" TIMESTAMP(3),
    "lastDriveSyncAt" TIMESTAMP(3),
    "cursor" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoogleConnection_workspaceId_idx" ON "GoogleConnection"("workspaceId");

-- CreateIndex
CREATE INDEX "GoogleConnection_ownerUserId_idx" ON "GoogleConnection"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleConnection_workspaceId_ownerUserId_googleAccountEmail_key" ON "GoogleConnection"("workspaceId", "ownerUserId", "googleAccountEmail");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleSyncState_connectionId_key" ON "GoogleSyncState"("connectionId");

-- AddForeignKey
ALTER TABLE "GoogleConnection" ADD CONSTRAINT "GoogleConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleConnection" ADD CONSTRAINT "GoogleConnection_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleSyncState" ADD CONSTRAINT "GoogleSyncState_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GoogleConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
