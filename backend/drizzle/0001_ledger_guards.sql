-- Financial and audit records are append-only, even when written outside the API.
CREATE TRIGGER IF NOT EXISTS immutable_entries_update BEFORE UPDATE ON entries
BEGIN
  SELECT RAISE(ABORT, 'Posted financial records are immutable; create a reversal');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS immutable_entries_delete BEFORE DELETE ON entries
BEGIN
  SELECT RAISE(ABORT, 'Posted financial records are immutable; create a reversal');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS immutable_effects_update BEFORE UPDATE ON entry_effects
BEGIN
  SELECT RAISE(ABORT, 'Posted financial records are immutable; create a reversal');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS immutable_effects_delete BEFORE DELETE ON entry_effects
BEGIN
  SELECT RAISE(ABORT, 'Posted financial records are immutable; create a reversal');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS immutable_draft_revisions_update BEFORE UPDATE ON draft_revisions
BEGIN
  SELECT RAISE(ABORT, 'Posted financial records are immutable; create a reversal');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS immutable_draft_revisions_delete BEFORE DELETE ON draft_revisions
BEGIN
  SELECT RAISE(ABORT, 'Posted financial records are immutable; create a reversal');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS immutable_financial_requests_update BEFORE UPDATE ON financial_requests
BEGIN
  SELECT RAISE(ABORT, 'Posted financial records are immutable; create a reversal');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS immutable_financial_requests_delete BEFORE DELETE ON financial_requests
BEGIN
  SELECT RAISE(ABORT, 'Posted financial records are immutable; create a reversal');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS immutable_draft_requests_update BEFORE UPDATE ON draft_requests
BEGIN
  SELECT RAISE(ABORT, 'Posted financial records are immutable; create a reversal');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS immutable_draft_requests_delete BEFORE DELETE ON draft_requests
BEGIN
  SELECT RAISE(ABORT, 'Posted financial records are immutable; create a reversal');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS immutable_management_events_update BEFORE UPDATE ON management_events
BEGIN
  SELECT RAISE(ABORT, 'Posted financial records are immutable; create a reversal');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS immutable_management_events_delete BEFORE DELETE ON management_events
BEGIN
  SELECT RAISE(ABORT, 'Posted financial records are immutable; create a reversal');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS immutable_management_requests_update BEFORE UPDATE ON management_requests
BEGIN
  SELECT RAISE(ABORT, 'Posted financial records are immutable; create a reversal');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS immutable_management_requests_delete BEFORE DELETE ON management_requests
BEGIN
  SELECT RAISE(ABORT, 'Posted financial records are immutable; create a reversal');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS journal_version AFTER INSERT ON entries
BEGIN
  UPDATE groups SET "ledgerVersion" = "ledgerVersion" + 1 WHERE id = NEW."groupId";
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS valid_lifecycle AFTER INSERT ON entries
BEGIN
  SELECT CASE
    WHEN (NEW.kind = 'refund') <> (NEW."refundOf" IS NOT NULL)
      OR (NEW.kind = 'reversal') <> (NEW.reverses IS NOT NULL)
      THEN RAISE(ABORT, 'Entry type and original-record link must agree')
    WHEN NEW."corrects" IS NOT NULL
      AND (NEW.kind IN ('refund', 'reversal') OR trim(coalesce(NEW."correctionReason", '')) = '')
      THEN RAISE(ABORT, 'Replacement requires a reason and an ordinary record type')
    WHEN NEW."corrects" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM entries WHERE reverses = NEW."corrects" AND "groupId" = NEW."groupId")
      THEN RAISE(ABORT, 'Replacement requires a linked reversal')
    WHEN NEW.kind = 'reversal'
      AND EXISTS (
        SELECT 1 FROM entries orig
        WHERE orig.id = NEW.reverses AND orig."groupId" = NEW."groupId"
          AND (orig.kind = 'reversal' OR NEW.date < orig.date)
      )
      THEN RAISE(ABORT, 'Invalid reversal target or date')
    WHEN NEW.kind = 'reversal'
      AND EXISTS (
        SELECT 1 FROM entries refund
        WHERE refund."refundOf" = NEW.reverses
          AND NOT EXISTS (SELECT 1 FROM entries rev WHERE rev.reverses = refund.id)
      )
      THEN RAISE(ABORT, 'Reverse active refunds before their original record')
    WHEN NEW.kind = 'refund'
      AND EXISTS (
        SELECT 1 FROM entries orig
        WHERE orig.id = NEW."refundOf" AND orig."groupId" = NEW."groupId"
          AND (orig.kind NOT IN ('income', 'expense') OR NEW.date < orig.date
               OR EXISTS (SELECT 1 FROM entries rev WHERE rev.reverses = orig.id))
      )
      THEN RAISE(ABORT, 'Refund requires an active income or expense record and a valid date')
    WHEN NEW.kind = 'refund'
      AND (
        SELECT sum(refund.amount) FROM entries refund
        WHERE refund."refundOf" = NEW."refundOf"
          AND NOT EXISTS (SELECT 1 FROM entries rev WHERE rev.reverses = refund.id)
      ) > (SELECT orig.amount FROM entries orig WHERE orig.id = NEW."refundOf")
      THEN RAISE(ABORT, 'Refund exceeds original amount')
  END;
END;
