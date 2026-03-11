-- Restore the soft-deleted POS sale transaction for today's order (POS-20260311-0001)
UPDATE public.transactions 
SET is_deleted = false 
WHERE idempotency_key = 'POS-ORDER-1459d2eb-073f-4c8e-8126-01b8b353790e' 
  AND is_deleted = true;

-- Restore the COGS transaction for the same order
UPDATE public.transactions 
SET is_deleted = false 
WHERE idempotency_key = 'POS-ORDER-1459d2eb-073f-4c8e-8126-01b8b353790e-COGS' 
  AND is_deleted = true;