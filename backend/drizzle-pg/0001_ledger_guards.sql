-- Financial and audit records are append-only, even when written outside the API.
CREATE FUNCTION reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Posted financial records are immutable; create a reversal';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER immutable_entries BEFORE UPDATE OR DELETE ON entries
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER immutable_effects BEFORE UPDATE OR DELETE ON entry_effects
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER immutable_draft_revisions BEFORE UPDATE OR DELETE ON draft_revisions
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER immutable_financial_requests BEFORE UPDATE OR DELETE ON financial_requests
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER immutable_draft_requests BEFORE UPDATE OR DELETE ON draft_requests
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER immutable_management_events BEFORE UPDATE OR DELETE ON management_events
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER immutable_management_requests BEFORE UPDATE OR DELETE ON management_requests
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
--> statement-breakpoint
CREATE FUNCTION validate_entry_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_id uuid;
  record entries%ROWTYPE;
  totals record;
BEGIN
  IF TG_TABLE_NAME = 'entries' THEN target_id := NEW.id;
  ELSE target_id := NEW."entryId";
  END IF;
  SELECT * INTO record FROM entries WHERE id = target_id;
  SELECT count(*) AS rows, sum("allocatedIncome") AS income,
    sum("allocatedExpense") AS expense, sum("activityCash") AS cash,
    sum("transferCash") AS transfers, sum("settlementCash") AS settlements,
    sum(obligation) AS obligations, sum(correction) AS corrections
    INTO totals FROM entry_effects WHERE "entryId" = target_id;
  IF totals.rows = 0 OR totals.income - totals.expense - totals.cash <> 0
    OR totals.transfers <> 0 OR totals.settlements <> 0
    OR totals.obligations <> 0 OR totals.corrections <> 0 THEN
    RAISE EXCEPTION 'Entry must contain balanced financial effects';
  END IF;
  IF record.kind = 'income' AND (totals.income <> record.amount OR totals.expense <> 0) THEN
    RAISE EXCEPTION 'Income allocation must equal entry amount';
  ELSIF record.kind = 'expense' AND (totals.expense <> record.amount OR totals.income <> 0) THEN
    RAISE EXCEPTION 'Expense allocation must equal entry amount';
  ELSIF record.kind IN ('transfer', 'settlement', 'obligation', 'adjustment')
    AND (totals.income <> 0 OR totals.expense <> 0 OR totals.cash <> 0) THEN
    RAISE EXCEPTION 'Non-activity entries cannot create income or expenses';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER balanced_entry AFTER INSERT ON entries
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_entry_balance();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER balanced_effect AFTER INSERT ON entry_effects
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_entry_balance();
--> statement-breakpoint
CREATE FUNCTION advance_ledger_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE groups SET "ledgerVersion" = "ledgerVersion" + 1 WHERE id = NEW."groupId";
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER journal_version AFTER INSERT ON entries
FOR EACH ROW EXECUTE FUNCTION advance_ledger_version();
--> statement-breakpoint
CREATE FUNCTION validate_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  original entries%ROWTYPE;
  refunded numeric;
  allocated_income numeric;
  allocated_expense numeric;
BEGIN
  IF (NEW.kind = 'refund') <> (NEW."refundOf" IS NOT NULL)
    OR (NEW.kind = 'reversal') <> (NEW.reverses IS NOT NULL) THEN
    RAISE EXCEPTION 'Entry type and original-record link must agree';
  END IF;
  IF NEW."corrects" IS NOT NULL THEN
    IF NEW.kind IN ('refund', 'reversal') OR NULLIF(trim(NEW."correctionReason"), '') IS NULL THEN
      RAISE EXCEPTION 'Replacement requires a reason and an ordinary record type';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM entries WHERE reverses = NEW.corrects AND "groupId" = NEW."groupId") THEN
      RAISE EXCEPTION 'Replacement requires a linked reversal';
    END IF;
  END IF;
  IF NEW.kind = 'reversal' THEN
    SELECT * INTO original FROM entries WHERE id = NEW.reverses AND "groupId" = NEW."groupId";
    IF original.kind = 'reversal' OR NEW.date < original.date THEN
      RAISE EXCEPTION 'Invalid reversal target or date';
    END IF;
    IF EXISTS (
      SELECT 1 FROM entries refund WHERE refund."refundOf" = original.id
      AND NOT EXISTS (SELECT 1 FROM entries reversal WHERE reversal.reverses = refund.id)
    ) THEN
      RAISE EXCEPTION 'Reverse active refunds before their original record';
    END IF;
  END IF;
  IF NEW.kind <> 'refund' THEN RETURN NULL; END IF;
  SELECT * INTO original FROM entries WHERE id = NEW."refundOf" AND "groupId" = NEW."groupId";
  IF original.kind NOT IN ('income', 'expense') OR NEW.date < original.date
    OR EXISTS (SELECT 1 FROM entries WHERE reverses = original.id) THEN
    RAISE EXCEPTION 'Refund requires an active income or expense record and a valid date';
  END IF;
  SELECT sum(refund.amount) INTO refunded FROM entries refund
    WHERE refund."refundOf" = original.id
    AND NOT EXISTS (SELECT 1 FROM entries reversal WHERE reversal.reverses = refund.id);
  IF refunded > original.amount THEN RAISE EXCEPTION 'Refund exceeds original amount'; END IF;
  SELECT sum("allocatedIncome"), sum("allocatedExpense")
    INTO allocated_income, allocated_expense FROM entry_effects WHERE "entryId" = NEW.id;
  IF (original.kind = 'income' AND (allocated_income <> -NEW.amount OR allocated_expense <> 0))
    OR (original.kind = 'expense' AND (allocated_expense <> -NEW.amount OR allocated_income <> 0)) THEN
    RAISE EXCEPTION 'Refund must reverse original economic allocation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM entry_effects effect JOIN entries refund ON refund.id = effect."entryId"
    WHERE refund."refundOf" = original.id
    AND NOT EXISTS (SELECT 1 FROM entries reversal WHERE reversal.reverses = refund.id)
    GROUP BY effect."memberId"
    HAVING -sum(effect."allocatedIncome") > COALESCE((SELECT "allocatedIncome" FROM entry_effects WHERE "entryId" = original.id AND "memberId" = effect."memberId"), 0)
      OR -sum(effect."allocatedExpense") > COALESCE((SELECT "allocatedExpense" FROM entry_effects WHERE "entryId" = original.id AND "memberId" = effect."memberId"), 0)
  ) THEN RAISE EXCEPTION 'Refund exceeds a member allocation'; END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER valid_lifecycle AFTER INSERT ON entries
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_lifecycle();
