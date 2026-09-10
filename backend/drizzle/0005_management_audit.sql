CREATE TRIGGER immutable_management_events BEFORE UPDATE OR DELETE ON management_events
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER immutable_management_requests BEFORE UPDATE OR DELETE ON management_requests
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
