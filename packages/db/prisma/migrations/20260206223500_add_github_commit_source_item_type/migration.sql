-- Add a new SourceItemType for GitHub commits. Postgres enums are append-only.
ALTER TYPE "SourceItemType" ADD VALUE 'GITHUB_COMMIT';

