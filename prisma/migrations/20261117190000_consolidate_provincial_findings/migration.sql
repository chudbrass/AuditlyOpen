-- AlterTable
ALTER TABLE "Finding" ADD COLUMN     "affectedProvinces" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "duplicateOfId" TEXT;

-- CreateIndex
CREATE INDEX "Finding_duplicateOfId_idx" ON "Finding"("duplicateOfId");

