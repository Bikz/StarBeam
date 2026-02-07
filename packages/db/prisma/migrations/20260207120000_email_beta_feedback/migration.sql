-- AlterTable
ALTER TABLE "User" ADD COLUMN     "betaAccessGrantedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN     "referralCode" TEXT;
ALTER TABLE "User" ADD COLUMN     "referredByUserId" TEXT;

-- CreateTable
CREATE TABLE "EmailLoginCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLoginCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BetaKey" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "maxUses" INTEGER NOT NULL DEFAULT 100,
    "expiresAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BetaKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BetaKeyRedemption" (
    "id" TEXT NOT NULL,
    "betaKeyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BetaKeyRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "message" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "path" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_betaAccessGrantedAt_idx" ON "User"("betaAccessGrantedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "User_referralCode_idx" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "User_referredByUserId_idx" ON "User"("referredByUserId");

-- CreateIndex
CREATE INDEX "EmailLoginCode_email_idx" ON "EmailLoginCode"("email");

-- CreateIndex
CREATE INDEX "EmailLoginCode_expiresAt_idx" ON "EmailLoginCode"("expiresAt");

-- CreateIndex
CREATE INDEX "EmailLoginCode_consumedAt_idx" ON "EmailLoginCode"("consumedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailLoginCode_email_codeHash_key" ON "EmailLoginCode"("email", "codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "BetaKey_codeHash_key" ON "BetaKey"("codeHash");

-- CreateIndex
CREATE INDEX "BetaKey_createdAt_idx" ON "BetaKey"("createdAt");

-- CreateIndex
CREATE INDEX "BetaKey_expiresAt_idx" ON "BetaKey"("expiresAt");

-- CreateIndex
CREATE INDEX "BetaKey_disabledAt_idx" ON "BetaKey"("disabledAt");

-- CreateIndex
CREATE UNIQUE INDEX "BetaKeyRedemption_betaKeyId_userId_key" ON "BetaKeyRedemption"("betaKeyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "BetaKeyRedemption_userId_key" ON "BetaKeyRedemption"("userId");

-- CreateIndex
CREATE INDEX "BetaKeyRedemption_betaKeyId_idx" ON "BetaKeyRedemption"("betaKeyId");

-- CreateIndex
CREATE INDEX "BetaKeyRedemption_createdAt_idx" ON "BetaKeyRedemption"("createdAt");

-- CreateIndex
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- CreateIndex
CREATE INDEX "Feedback_source_idx" ON "Feedback"("source");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BetaKeyRedemption" ADD CONSTRAINT "BetaKeyRedemption_betaKeyId_fkey" FOREIGN KEY ("betaKeyId") REFERENCES "BetaKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BetaKeyRedemption" ADD CONSTRAINT "BetaKeyRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
