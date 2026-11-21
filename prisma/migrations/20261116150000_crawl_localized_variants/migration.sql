-- AlterTable
ALTER TABLE "Page" ADD COLUMN "language" TEXT,
ADD COLUMN "province" TEXT,
ADD COLUMN "requestedProvince" TEXT;

-- AlterTable
ALTER TABLE "Finding" ADD COLUMN "language" TEXT,
ADD COLUMN "province" TEXT;
