-- CreateEnum
CREATE TYPE "GitHubRepoSelectionMode" AS ENUM ('ALL', 'SELECTED');

-- AlterTable
ALTER TABLE "GitHubConnection" ADD COLUMN "repoSelectionMode" "GitHubRepoSelectionMode" NOT NULL DEFAULT 'ALL';
ALTER TABLE "GitHubConnection" ADD COLUMN "selectedRepoFullNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
