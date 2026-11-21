-- AlterEnum
BEGIN;
CREATE TYPE "ScanType_new" AS ENUM ('CRAWL', 'PAGE_AUDIT');
ALTER TABLE "public"."Scan" ALTER COLUMN "scanType" DROP DEFAULT;
ALTER TABLE "Scan" ALTER COLUMN "scanType" TYPE "ScanType_new" USING ("scanType"::text::"ScanType_new");
ALTER TYPE "ScanType" RENAME TO "ScanType_old";
ALTER TYPE "ScanType_new" RENAME TO "ScanType";
DROP TYPE "public"."ScanType_old";
ALTER TABLE "Scan" ALTER COLUMN "scanType" SET DEFAULT 'CRAWL';
COMMIT;

-- AlterTable
ALTER TABLE "Site" DROP COLUMN "priorityUrls",
DROP COLUMN "quickCheckCron",
DROP COLUMN "quickCheckNextRunAt";
