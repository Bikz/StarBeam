-- CreateTable
CREATE TABLE "SchedulerState" (
    "key" TEXT NOT NULL,
    "cursor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulerState_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "SchedulerState_updatedAt_idx" ON "SchedulerState"("updatedAt");

