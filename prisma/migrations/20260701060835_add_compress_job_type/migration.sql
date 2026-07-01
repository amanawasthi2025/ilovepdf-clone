-- CreateEnum
CREATE TYPE "CompressionLevel" AS ENUM ('LOW', 'RECOMMENDED', 'HIGH');

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'COMPRESS';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "compressionLevel" "CompressionLevel";
