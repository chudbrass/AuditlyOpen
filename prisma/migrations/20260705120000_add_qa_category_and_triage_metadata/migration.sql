-- Add QA to the finding Category enum (safe: new value is not used within this transaction)
ALTER TYPE "Category" ADD VALUE 'QA';

-- Triage metadata on findings (drives the Issues page filters)
ALTER TABLE "Finding" ADD COLUMN "conformance" TEXT;
ALTER TABLE "Finding" ADD COLUMN "responsibleRole" TEXT;
ALTER TABLE "Finding" ADD COLUMN "elementType" TEXT;

CREATE INDEX "Finding_scanId_conformance_idx" ON "Finding"("scanId", "conformance");
CREATE INDEX "Finding_scanId_responsibleRole_idx" ON "Finding"("scanId", "responsibleRole");

-- Per-scan QA sub-score alongside the existing category scores
ALTER TABLE "Scan" ADD COLUMN "scoreQa" INTEGER;
