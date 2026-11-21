-- AlterEnum
ALTER TYPE "PageStatus" ADD VALUE 'AUDITING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ScanStatus" ADD VALUE 'STARTING';
ALTER TYPE "ScanStatus" ADD VALUE 'FINALIZING';

-- AlterTable
ALTER TABLE "ItemCheck" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "attemptToken" TEXT,
ADD COLUMN     "leaseExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "attemptToken" TEXT,
ADD COLUMN     "leaseExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Scan" ADD COLUMN     "attemptToken" TEXT,
ADD COLUMN     "leaseExpiresAt" TIMESTAMP(3);
