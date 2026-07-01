-- CreateEnum
CREATE TYPE "ImageFormat" AS ENUM ('PNG', 'JPEG');

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'PDF_TO_IMAGE';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "imageFormat" "ImageFormat";
