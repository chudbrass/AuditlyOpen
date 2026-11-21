-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('QUEUED', 'CRAWLING', 'AUDITING', 'COMPLETE', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "PageStatus" AS ENUM ('PENDING', 'FETCHED', 'AUDITED', 'ERROR');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('LINKS', 'SEO', 'PERFORMANCE', 'A11Y');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'SERIOUS', 'MODERATE', 'MINOR');

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rootUrl" TEXT NOT NULL,
    "seedUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "includePatterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludePatterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxPages" INTEGER NOT NULL DEFAULT 1000,
    "concurrency" INTEGER NOT NULL DEFAULT 5,
    "checkExternalLinks" BOOLEAN NOT NULL DEFAULT true,
    "auditSampleSize" INTEGER NOT NULL DEFAULT 20,
    "priorityUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scheduleCron" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "pagesFound" INTEGER NOT NULL DEFAULT 0,
    "pagesCrawled" INTEGER NOT NULL DEFAULT 0,
    "pagesAudited" INTEGER NOT NULL DEFAULT 0,
    "scoreOverall" INTEGER,
    "scoreLinks" INTEGER,
    "scoreSeo" INTEGER,
    "scorePerformance" INTEGER,
    "scoreA11y" INTEGER,
    "issueCounts" JSONB,

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "PageStatus" NOT NULL DEFAULT 'PENDING',
    "httpStatus" INTEGER,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "audited" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "metaDescription" TEXT,
    "h1Count" INTEGER,
    "perfScore" INTEGER,
    "a11yScore" INTEGER,
    "fetchedAt" TIMESTAMP(3),

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Link" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL,
    "httpStatus" INTEGER,
    "broken" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,

    CONSTRAINT "Link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "pageId" TEXT,
    "category" "Category" NOT NULL,
    "severity" "Severity" NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "evidence" JSONB,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Scan_siteId_startedAt_idx" ON "Scan"("siteId", "startedAt");

-- CreateIndex
CREATE INDEX "Page_scanId_status_idx" ON "Page"("scanId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Page_scanId_url_key" ON "Page"("scanId", "url");

-- CreateIndex
CREATE INDEX "Link_scanId_broken_idx" ON "Link"("scanId", "broken");

-- CreateIndex
CREATE INDEX "Finding_scanId_category_severity_idx" ON "Finding"("scanId", "category", "severity");

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
