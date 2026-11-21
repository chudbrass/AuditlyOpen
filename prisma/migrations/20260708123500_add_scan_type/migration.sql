CREATE TYPE "ScanType" AS ENUM ('CRAWL', 'PAGE_AUDIT');

ALTER TABLE "Scan"
ADD COLUMN "scanType" "ScanType" NOT NULL DEFAULT 'CRAWL';

CREATE INDEX "Scan_siteId_scanType_startedAt_idx" ON "Scan"("siteId", "scanType", "startedAt");
