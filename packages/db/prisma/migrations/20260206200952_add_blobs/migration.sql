-- CreateEnum
CREATE TYPE "BlobEncryption" AS ENUM ('AES_256_GCM_V1');

-- AlterTable
ALTER TABLE "SourceItem" ADD COLUMN     "contentBlobId" TEXT;

-- CreateTable
CREATE TABLE "Blob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "contentType" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "encryption" "BlobEncryption" NOT NULL DEFAULT 'AES_256_GCM_V1',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Blob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Blob_workspaceId_idx" ON "Blob"("workspaceId");

-- CreateIndex
CREATE INDEX "Blob_ownerUserId_idx" ON "Blob"("ownerUserId");

-- CreateIndex
CREATE INDEX "Blob_deletedAt_idx" ON "Blob"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Blob_bucket_key_key" ON "Blob"("bucket", "key");

-- CreateIndex
CREATE INDEX "SourceItem_contentBlobId_idx" ON "SourceItem"("contentBlobId");

-- AddForeignKey
ALTER TABLE "Blob" ADD CONSTRAINT "Blob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blob" ADD CONSTRAINT "Blob_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_contentBlobId_fkey" FOREIGN KEY ("contentBlobId") REFERENCES "Blob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
