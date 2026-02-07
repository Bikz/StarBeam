-- Add a user-local timezone for daily pulse scheduling.
ALTER TABLE "User" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';

