-- CreateEnum
CREATE TYPE "GitHubConnectionStatus" AS ENUM ('CONNECTED', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "LinearConnectionStatus" AS ENUM ('CONNECTED', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "NotionConnectionStatus" AS ENUM ('CONNECTED', 'REVOKED', 'ERROR');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SourceItemType" ADD VALUE 'GITHUB_ISSUE';
ALTER TYPE "SourceItemType" ADD VALUE 'GITHUB_PULL_REQUEST';
ALTER TYPE "SourceItemType" ADD VALUE 'LINEAR_ISSUE';
ALTER TYPE "SourceItemType" ADD VALUE 'NOTION_PAGE';

-- CreateTable
CREATE TABLE "GitHubConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "githubLogin" TEXT NOT NULL,
    "tokenEnc" TEXT NOT NULL,
    "status" "GitHubConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastSyncedAt" TIMESTAMP(3),
    "cursor" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinearConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "linearUserId" TEXT NOT NULL,
    "linearUserEmail" TEXT,
    "tokenEnc" TEXT NOT NULL,
    "status" "LinearConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastSyncedAt" TIMESTAMP(3),
    "cursor" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinearConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotionConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "notionBotId" TEXT NOT NULL,
    "notionWorkspaceName" TEXT,
    "tokenEnc" TEXT NOT NULL,
    "status" "NotionConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastSyncedAt" TIMESTAMP(3),
    "cursor" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotionConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GitHubConnection_workspaceId_idx" ON "GitHubConnection"("workspaceId");

-- CreateIndex
CREATE INDEX "GitHubConnection_ownerUserId_idx" ON "GitHubConnection"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubConnection_workspaceId_ownerUserId_githubLogin_key" ON "GitHubConnection"("workspaceId", "ownerUserId", "githubLogin");

-- CreateIndex
CREATE INDEX "LinearConnection_workspaceId_idx" ON "LinearConnection"("workspaceId");

-- CreateIndex
CREATE INDEX "LinearConnection_ownerUserId_idx" ON "LinearConnection"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "LinearConnection_workspaceId_ownerUserId_linearUserId_key" ON "LinearConnection"("workspaceId", "ownerUserId", "linearUserId");

-- CreateIndex
CREATE INDEX "NotionConnection_workspaceId_idx" ON "NotionConnection"("workspaceId");

-- CreateIndex
CREATE INDEX "NotionConnection_ownerUserId_idx" ON "NotionConnection"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "NotionConnection_workspaceId_ownerUserId_notionBotId_key" ON "NotionConnection"("workspaceId", "ownerUserId", "notionBotId");

-- AddForeignKey
ALTER TABLE "GitHubConnection" ADD CONSTRAINT "GitHubConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubConnection" ADD CONSTRAINT "GitHubConnection_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinearConnection" ADD CONSTRAINT "LinearConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinearConnection" ADD CONSTRAINT "LinearConnection_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotionConnection" ADD CONSTRAINT "NotionConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotionConnection" ADD CONSTRAINT "NotionConnection_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
