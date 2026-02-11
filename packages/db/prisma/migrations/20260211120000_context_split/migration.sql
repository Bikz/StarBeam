-- AlterTable
ALTER TABLE "Membership" ADD COLUMN "primaryDepartmentId" TEXT;

-- CreateTable
CREATE TABLE "WorkspaceMemberProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobTitle" TEXT,
    "about" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMemberProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalGoal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "targetWindow" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalGoal_pkey" PRIMARY KEY ("id")
);

-- Ensure a General track exists in every workspace.
INSERT INTO "Department" ("id", "workspaceId", "name", "promptTemplate", "enabled", "createdAt", "updatedAt")
SELECT CONCAT('dept_general_', w.id), w.id, 'General', '', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Workspace" w
WHERE NOT EXISTS (
    SELECT 1
    FROM "Department" d
    WHERE d."workspaceId" = w.id
      AND d."name" = 'General'
);

-- Ensure every member belongs to General.
INSERT INTO "DepartmentMembership" ("id", "departmentId", "userId", "createdAt")
SELECT CONCAT('dm_general_', m.id), d.id, m."userId", CURRENT_TIMESTAMP
FROM "Membership" m
JOIN "Department" d
  ON d."workspaceId" = m."workspaceId"
 AND d."name" = 'General'
WHERE NOT EXISTS (
    SELECT 1
    FROM "DepartmentMembership" dm
    WHERE dm."departmentId" = d.id
      AND dm."userId" = m."userId"
);

-- Set primary track from the user's oldest department membership in this workspace.
WITH ranked AS (
    SELECT
        m.id AS membership_id,
        dm."departmentId" AS department_id,
        ROW_NUMBER() OVER (
            PARTITION BY m.id
            ORDER BY dm."createdAt" ASC, dm.id ASC
        ) AS rn
    FROM "Membership" m
    JOIN "DepartmentMembership" dm
      ON dm."userId" = m."userId"
    JOIN "Department" d
      ON d.id = dm."departmentId"
     AND d."workspaceId" = m."workspaceId"
)
UPDATE "Membership" m
SET "primaryDepartmentId" = ranked.department_id
FROM ranked
WHERE ranked.membership_id = m.id
  AND ranked.rn = 1
  AND m."primaryDepartmentId" IS NULL;

-- Fallback: if no scoped membership was found, assign General.
UPDATE "Membership" m
SET "primaryDepartmentId" = d.id
FROM "Department" d
WHERE d."workspaceId" = m."workspaceId"
  AND d."name" = 'General'
  AND m."primaryDepartmentId" IS NULL;

-- CreateIndex
CREATE INDEX "Membership_primaryDepartmentId_idx" ON "Membership"("primaryDepartmentId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMemberProfile_workspaceId_userId_key" ON "WorkspaceMemberProfile"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "WorkspaceMemberProfile_workspaceId_idx" ON "WorkspaceMemberProfile"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceMemberProfile_userId_idx" ON "WorkspaceMemberProfile"("userId");

-- CreateIndex
CREATE INDEX "PersonalGoal_workspaceId_userId_idx" ON "PersonalGoal"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "PersonalGoal_workspaceId_active_idx" ON "PersonalGoal"("workspaceId", "active");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_primaryDepartmentId_fkey" FOREIGN KEY ("primaryDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMemberProfile" ADD CONSTRAINT "WorkspaceMemberProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMemberProfile" ADD CONSTRAINT "WorkspaceMemberProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalGoal" ADD CONSTRAINT "PersonalGoal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalGoal" ADD CONSTRAINT "PersonalGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
