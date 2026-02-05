-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('NEW', 'TRIAGED', 'CLOSED');

-- CreateTable
CREATE TABLE "IdeaSubmission" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "status" "IdeaStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdeaSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdeaSubmission_workspaceId_idx" ON "IdeaSubmission"("workspaceId");

-- CreateIndex
CREATE INDEX "IdeaSubmission_status_idx" ON "IdeaSubmission"("status");

-- AddForeignKey
ALTER TABLE "IdeaSubmission" ADD CONSTRAINT "IdeaSubmission_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaSubmission" ADD CONSTRAINT "IdeaSubmission_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
