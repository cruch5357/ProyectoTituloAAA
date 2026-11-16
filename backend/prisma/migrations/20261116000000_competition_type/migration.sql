-- CreateEnum
CREATE TYPE "CompetitionType" AS ENUM ('MEDICAL', 'SPORTS');

-- AlterTable
-- Nullable and without a default so existing milestones remain unclassified.
ALTER TABLE "competitions" ADD COLUMN "type" "CompetitionType";
