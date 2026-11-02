-- Keep the last administrative attendance correction reason on the private
-- participation record. Audit metadata deliberately excludes free-form text.
ALTER TABLE "SessionParticipant" ADD COLUMN "attendanceCorrectionReason" TEXT;
