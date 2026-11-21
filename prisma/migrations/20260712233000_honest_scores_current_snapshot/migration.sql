ALTER TABLE "Scan"
  ADD COLUMN "sourceScanId" TEXT,
  ADD COLUMN "scoreVersion" INTEGER,
  ADD COLUMN "categoryCoverage" JSONB,
  ADD COLUMN "categoryProvenance" JSONB;

ALTER TABLE "Page"
  ADD COLUMN "fetchError" TEXT,
  ADD COLUMN "performanceAuditError" TEXT,
  ADD COLUMN "accessibilityAuditError" TEXT;

ALTER TABLE "Finding" ADD COLUMN "fingerprint" TEXT;
CREATE INDEX "Finding_fingerprint_idx" ON "Finding"("fingerprint");
