
-- =============================================
-- MIGRATION 1: Critical Integrity Fixes
-- C-02: FK references for account codes
-- C-07: Idempotency key  
-- C-04: Auto-assign admin role for first user
-- C-08: Soft-delete audit trail
-- =============================================

-- 1. Add idempotency_key to transactions (C-07)
ALTER TABLE public.transactions 
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_idempotency_key 
  ON public.transactions(idempotency_key) 
  WHERE idempotency_key IS NOT NULL;

-- 2. Add FK reference columns for debit/credit accounts (C-02)
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS account_id_debit UUID,
  ADD COLUMN IF NOT EXISTS account_id_credit UUID;

-- 3. Add payment_method to transactions for better tracking
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- 4. Add linked_transaction_id to cheques for tracing journal entries
ALTER TABLE public.cheques
  ADD COLUMN IF NOT EXISTS linked_transaction_id UUID;

-- 5. Add linked_transaction_id to employee_payroll
ALTER TABLE public.employee_payroll
  ADD COLUMN IF NOT EXISTS linked_transaction_id UUID;

-- 6. Create trigger to auto-resolve account IDs from codes (C-02)
CREATE OR REPLACE FUNCTION public.resolve_account_ids()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Resolve debit account
  IF NEW.debit_account_code IS NOT NULL AND NEW.account_id_debit IS NULL THEN
    SELECT id INTO NEW.account_id_debit
    FROM public.accounts
    WHERE account_code = NEW.debit_account_code
      AND user_id = NEW.user_id
    LIMIT 1;
  END IF;

  -- Resolve credit account
  IF NEW.credit_account_code IS NOT NULL AND NEW.account_id_credit IS NULL THEN
    SELECT id INTO NEW.account_id_credit
    FROM public.accounts
    WHERE account_code = NEW.credit_account_code
      AND user_id = NEW.user_id
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_resolve_account_ids
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_account_ids();

-- 7. Auto-assign admin role for new users (C-04)
CREATE OR REPLACE FUNCTION public.auto_assign_admin_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if this is the first profile (i.e., only one user exists = admin)
  -- Every new user gets admin role by default (single-tenant system)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_assign_admin
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_admin_role();

-- 8. Backfill: resolve existing account IDs
UPDATE public.transactions t
SET account_id_debit = a.id
FROM public.accounts a
WHERE a.account_code = t.debit_account_code
  AND a.user_id = t.user_id
  AND t.account_id_debit IS NULL;

UPDATE public.transactions t
SET account_id_credit = a.id
FROM public.accounts a
WHERE a.account_code = t.credit_account_code
  AND a.user_id = t.user_id
  AND t.account_id_credit IS NULL;

-- 9. Backfill: assign admin role to existing users who don't have it
INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, 'admin'
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur 
  WHERE ur.user_id = p.user_id AND ur.role = 'admin'
)
ON CONFLICT (user_id, role) DO NOTHING;
