-- CreateEnum
CREATE TYPE "PulseEditionStatus" AS ENUM ('READY', 'GENERATING', 'ERROR');

-- CreateEnum
CREATE TYPE "PulseCardKind" AS ENUM ('ANNOUNCEMENT', 'GOAL', 'WEB_RESEARCH', 'INTERNAL');

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('NIGHTLY_WORKSPACE_RUN');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "PulseEdition" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "editionDate" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "PulseEditionStatus" NOT NULL DEFAULT 'GENERATING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PulseEdition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PulseCard" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "kind" "PulseCardKind" NOT NULL,
    "departmentId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "why" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL DEFAULT '',
    "sources" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PulseCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "JobKind" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorSummary" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PulseEdition_workspaceId_idx" ON "PulseEdition"("workspaceId");

-- CreateIndex
CREATE INDEX "PulseEdition_userId_idx" ON "PulseEdition"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PulseEdition_workspaceId_userId_editionDate_key" ON "PulseEdition"("workspaceId", "userId", "editionDate");

-- CreateIndex
CREATE INDEX "PulseCard_editionId_idx" ON "PulseCard"("editionId");

-- CreateIndex
CREATE INDEX "PulseCard_kind_idx" ON "PulseCard"("kind");

-- CreateIndex
CREATE INDEX "PulseCard_departmentId_idx" ON "PulseCard"("departmentId");

-- CreateIndex
CREATE INDEX "JobRun_workspaceId_idx" ON "JobRun"("workspaceId");

-- CreateIndex
CREATE INDEX "JobRun_kind_idx" ON "JobRun"("kind");

-- CreateIndex
CREATE INDEX "JobRun_status_idx" ON "JobRun"("status");

-- AddForeignKey
ALTER TABLE "PulseEdition" ADD CONSTRAINT "PulseEdition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PulseEdition" ADD CONSTRAINT "PulseEdition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PulseCard" ADD CONSTRAINT "PulseCard_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "PulseEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PulseCard" ADD CONSTRAINT "PulseCard_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
