-- AlterEnum
BEGIN;
CREATE TYPE "Category_new" AS ENUM ('LINKS', 'SEO', 'PERFORMANCE', 'A11Y', 'QA', 'SECURITY');
ALTER TABLE "Finding" ALTER COLUMN "category" TYPE "Category_new" USING ("category"::text::"Category_new");
ALTER TYPE "Category" RENAME TO "Category_old";
ALTER TYPE "Category_new" RENAME TO "Category";
DROP TYPE "public"."Category_old";
COMMIT;

-- AlterTable
ALTER TABLE "Scan" DROP COLUMN "scorePrivacy";

-- AlterTable
ALTER TABLE "Site" DROP COLUMN "auditSampleSize";
