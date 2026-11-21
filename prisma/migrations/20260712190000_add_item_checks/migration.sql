CREATE TYPE "ItemCheckStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETE', 'FAILED');

CREATE TABLE "ItemCheck" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "findingId" TEXT,
    "findingCode" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "taskPageUrl" TEXT,
    "targetUrl" TEXT,
    "status" "ItemCheckStatus" NOT NULL DEFAULT 'QUEUED',
    "issuePresent" BOOLEAN,
    "error" TEXT,
    "tasksCompleted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "ItemCheck_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ItemCheck_findingId_createdAt_idx" ON "ItemCheck"("findingId", "createdAt");
CREATE INDEX "ItemCheck_status_createdAt_idx" ON "ItemCheck"("status", "createdAt");
ALTER TABLE "ItemCheck" ADD CONSTRAINT "ItemCheck_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemCheck" ADD CONSTRAINT "ItemCheck_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
