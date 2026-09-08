-- Financial records are append-only, even when written outside the API.
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
