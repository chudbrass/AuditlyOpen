-- AlterEnum
ALTER TYPE "ScanType" ADD VALUE 'QUICK_CHECK';

-- AlterTable
ALTER TABLE "Site" ADD COLUMN "quickCheckCron" TEXT;
