-- Dedicated onboarding wizard v3:
-- - Track onboarding completion per membership
-- - Enrich personal profile fields for better first-pulse context + Exa matching

ALTER TABLE "Membership"
  ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

ALTER TABLE "WorkspaceMemberProfile"
  ADD COLUMN "fullName" TEXT,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "company" TEXT,
  ADD COLUMN "companyUrl" TEXT,
  ADD COLUMN "linkedinUrl" TEXT,
  ADD COLUMN "websiteUrl" TEXT;

