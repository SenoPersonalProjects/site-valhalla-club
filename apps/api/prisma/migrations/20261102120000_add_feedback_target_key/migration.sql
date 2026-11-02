-- PostgreSQL migration. Preserve existing feedback and abort atomically on
-- duplicate targets or inconsistent targetType/targetUserId combinations.
BEGIN;

ALTER TABLE "Feedback" ADD COLUMN "targetKey" TEXT;

-- The API must use this same canonical representation for all new writes.
UPDATE "Feedback"
SET "targetKey" = CASE
    WHEN "targetType" = 'SESSION' AND "targetUserId" IS NULL
        THEN 'SESSION'
    WHEN "targetType" = 'MASTER' AND "targetUserId" IS NOT NULL
        THEN 'MASTER:' || "targetUserId"
    WHEN "targetType" = 'PLAYER' AND "targetUserId" IS NOT NULL
        THEN 'PLAYER:' || "targetUserId"
    ELSE NULL
END;

-- Invalid legacy targets remain NULL and fail here; never repair or delete
-- historical records implicitly. Resolve inconsistencies before retrying.
ALTER TABLE "Feedback" ALTER COLUMN "targetKey" SET NOT NULL;

CREATE UNIQUE INDEX "Feedback_authorId_sessionId_targetKey_key"
    ON "Feedback"("authorId", "sessionId", "targetKey");

COMMIT;
