-- AlterTable
ALTER TABLE "Scan" ADD COLUMN     "scanProvinces" VARCHAR(2)[] DEFAULT ARRAY[]::VARCHAR(2)[];

