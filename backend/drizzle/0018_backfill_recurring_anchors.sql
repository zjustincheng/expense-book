-- Preserve an explicit anchor; legacy schedules use their current scheduled day.
-- A day already lost to earlier date drift cannot be reconstructed reliably.
UPDATE "recurring_transactions"
SET "anchorDay" = CAST(substr(CAST("nextRun" AS text), 9, 2) AS integer)
WHERE "anchorDay" IS NULL AND "frequency" <> 'weekly';
