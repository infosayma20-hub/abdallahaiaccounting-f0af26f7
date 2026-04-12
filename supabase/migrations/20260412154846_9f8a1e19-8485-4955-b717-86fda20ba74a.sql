
-- Remove the trigger that creates duplicate cheque collection journal entries
-- The application code in ChequesPage.tsx already handles this correctly
DROP TRIGGER IF EXISTS trg_auto_journal_cheque ON public.cheques;
DROP FUNCTION IF EXISTS public.auto_journal_cheque_collection();

-- Soft-delete the duplicate transaction created by the trigger
-- The trigger used credit_account_code=1150 (wrong) while the app code uses 1125 (correct)
UPDATE public.transactions 
SET is_deleted = true, idempotency_key = NULL
WHERE idempotency_key LIKE 'CHQ-COLLECT-%'
AND credit_account_code = '1150'
AND transaction_type = 'cheque_collection';
