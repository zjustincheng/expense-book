-- Preserve an explicit anchor; legacy schedules use their current scheduled day.
-- A day already lost to earlier date drift cannot be reconstructed reliably.
UPDATE "recurring_transactions"
SET "anchorDay" = EXTRACT(DAY FROM "nextRun")::integer
WHERE "anchorDay" IS NULL AND "frequency" <> 'weekly';
