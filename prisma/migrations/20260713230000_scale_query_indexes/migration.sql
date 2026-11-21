-- DropIndex
DROP INDEX "Finding_fingerprint_idx";

-- DropIndex
DROP INDEX "Page_scanId_url_key";

-- AlterTable
ALTER TABLE "Link" ADD COLUMN "sourcePageId" TEXT;

-- AlterTable
ALTER TABLE "Page" ADD COLUMN "urlHash" VARCHAR(64);

-- CreateIndex
CREATE INDEX "Alert_createdAt_id_idx" ON "Alert"("createdAt", "id");
CREATE INDEX "Alert_level_createdAt_id_idx" ON "Alert"("level", "createdAt", "id");
CREATE INDEX "Finding_scanId_code_id_idx" ON "Finding"("scanId", "code", "id");
CREATE INDEX "Finding_scanId_fingerprint_idx" ON "Finding"("scanId", "fingerprint");
CREATE INDEX "ItemCheck_siteId_idx" ON "ItemCheck"("siteId");
CREATE INDEX "ItemCheck_status_leaseExpiresAt_idx" ON "ItemCheck"("status", "leaseExpiresAt");
CREATE INDEX "Link_sourcePageId_idx" ON "Link"("sourcePageId");
CREATE INDEX "Link_scanId_broken_id_idx" ON "Link"("scanId", "broken", "id");
CREATE INDEX "Page_scanId_status_depth_id_idx" ON "Page"("scanId", "status", "depth", "id");
CREATE INDEX "Page_status_leaseExpiresAt_idx" ON "Page"("status", "leaseExpiresAt");
CREATE INDEX "Page_scanId_audited_perfScore_id_idx" ON "Page"("scanId", "audited", "perfScore", "id");
CREATE UNIQUE INDEX "Page_scanId_urlHash_key" ON "Page"("scanId", "urlHash");
CREATE INDEX "Scan_status_updatedAt_idx" ON "Scan"("status", "updatedAt");
CREATE INDEX "Scan_status_leaseExpiresAt_idx" ON "Scan"("status", "leaseExpiresAt");
CREATE INDEX "Scan_status_scanType_startedAt_id_idx" ON "Scan"("status", "scanType", "startedAt", "id");
CREATE INDEX "Scan_siteId_status_scanType_finishedAt_idx" ON "Scan"("siteId", "status", "scanType", "finishedAt");
CREATE INDEX "Task_siteId_idx" ON "Task"("siteId");
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");
CREATE INDEX "Task_createdAt_id_idx" ON "Task"("createdAt", "id");
CREATE INDEX "UptimeCheck_checkedAt_idx" ON "UptimeCheck"("checkedAt");

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_sourcePageId_fkey" FOREIGN KEY ("sourcePageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
