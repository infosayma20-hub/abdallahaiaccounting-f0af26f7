DROP INDEX IF EXISTS public.idx_transactions_idempotency_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_idempotency_key
  ON public.transactions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;