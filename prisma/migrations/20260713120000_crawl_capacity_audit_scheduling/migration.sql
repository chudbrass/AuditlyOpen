CREATE TYPE "AuditSampleReason" AS ENUM ('HOMEPAGE', 'PRIORITY', 'RANDOM');

ALTER TABLE "Scan"
  ADD COLUMN "auditPageLimit" INTEGER,
  ADD COLUMN "auditSampleSeed" TEXT,
  ADD COLUMN "linksDiscovered" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Page"
  ADD COLUMN "auditReason" "AuditSampleReason",
  ADD COLUMN "linksDiscovered" INTEGER NOT NULL DEFAULT 0;
