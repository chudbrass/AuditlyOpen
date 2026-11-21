-- AlterEnum
ALTER TYPE "ScanType" ADD VALUE 'TEXT_SEARCH';

-- AlterTable
ALTER TABLE "Scan" ADD COLUMN     "textSearchQuery" TEXT;

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "textMatchCount" INTEGER,
ADD COLUMN     "textMatchExcerpts" JSONB;

