-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'SPLIT';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "splitRanges" TEXT;
