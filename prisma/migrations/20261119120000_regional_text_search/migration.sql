-- AlterTable
ALTER TABLE "TextSearchMatch" DROP CONSTRAINT "TextSearchMatch_pkey",
ADD COLUMN     "province" VARCHAR(2) NOT NULL DEFAULT '',
ADD CONSTRAINT "TextSearchMatch_pkey" PRIMARY KEY ("scanId", "urlHash", "province");
