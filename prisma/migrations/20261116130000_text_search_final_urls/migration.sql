-- CreateTable
CREATE TABLE "TextSearchMatch" (
    "scanId" TEXT NOT NULL,
    "urlHash" VARCHAR(64) NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "count" INTEGER NOT NULL,
    "excerpts" JSONB NOT NULL,

    CONSTRAINT "TextSearchMatch_pkey" PRIMARY KEY ("scanId","urlHash")
);

-- AddForeignKey
ALTER TABLE "TextSearchMatch" ADD CONSTRAINT "TextSearchMatch_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

