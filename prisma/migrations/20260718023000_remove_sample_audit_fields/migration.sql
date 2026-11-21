-- AlterTable
ALTER TABLE "Page" DROP COLUMN "accessibilityAuditError",
DROP COLUMN "auditReason";

-- AlterTable
ALTER TABLE "Scan" DROP COLUMN "auditSampleSeed";

-- DropEnum
DROP TYPE "AuditSampleReason";
