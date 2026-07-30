DROP TRIGGER IF EXISTS trg_enforce_transaction_contact_subledger ON public.transactions;
CREATE TRIGGER trg_enforce_transaction_contact_subledger
BEFORE INSERT OR UPDATE OF user_id, contact_id, debit_account_code, credit_account_code, is_deleted
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_transaction_contact_subledger();