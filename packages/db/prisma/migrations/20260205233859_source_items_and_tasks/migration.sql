-- CreateEnum
CREATE TYPE "SourceItemType" AS ENUM ('GMAIL_MESSAGE', 'CALENDAR_EVENT', 'DRIVE_FILE');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'SNOOZED');

-- CreateTable
CREATE TABLE "SourceItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "connectionId" TEXT,
    "type" "SourceItemType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT,
    "title" TEXT NOT NULL,
    "snippet" TEXT,
    "contentText" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "metadata" JSONB,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceItemId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceItem_workspaceId_idx" ON "SourceItem"("workspaceId");

-- CreateIndex
CREATE INDEX "SourceItem_ownerUserId_idx" ON "SourceItem"("ownerUserId");

-- CreateIndex
CREATE INDEX "SourceItem_connectionId_idx" ON "SourceItem"("connectionId");

-- CreateIndex
CREATE INDEX "SourceItem_occurredAt_idx" ON "SourceItem"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourceItem_workspaceId_ownerUserId_type_externalId_key" ON "SourceItem"("workspaceId", "ownerUserId", "type", "externalId");

-- CreateIndex
CREATE INDEX "Task_workspaceId_idx" ON "Task"("workspaceId");

-- CreateIndex
CREATE INDEX "Task_userId_idx" ON "Task"("userId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Task_userId_sourceItemId_key" ON "Task"("userId", "sourceItemId");

-- AddForeignKey
ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GoogleConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
