-- Backfill: category is derived metadata from the rule registry, not a scan result, so
-- rewriting it on historical findings does not violate scan immutability — it keeps trend
-- lines comparable now that SECURITY/PRIVACY no longer roll into QA.
-- Must run in a separate migration from the ALTER TYPE ... ADD VALUE statements: Postgres
-- forbids using a new enum value in the same transaction that added it.
UPDATE "Finding" SET "category" = 'SECURITY' WHERE "code" LIKE 'sec.%';
UPDATE "Finding" SET "category" = 'PRIVACY' WHERE "code" LIKE 'privacy.%';
