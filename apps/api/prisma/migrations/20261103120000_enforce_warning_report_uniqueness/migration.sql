-- A report can originate at most one warning, regardless of its later status.
-- NULL reportId still allows independent directly issued warnings.
-- Abort without deleting legacy duplicates or losing the previous lookup index.
BEGIN;

CREATE UNIQUE INDEX "Warning_reportId_key" ON "Warning"("reportId");

-- The unique index also serves reportId lookups.
DROP INDEX "Warning_reportId_idx";

COMMIT;
