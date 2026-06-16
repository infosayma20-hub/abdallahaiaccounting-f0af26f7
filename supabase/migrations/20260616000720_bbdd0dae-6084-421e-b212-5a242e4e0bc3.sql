
-- 1) Add currency column to accounts
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'شيكل';

-- Constrain values to known Arabic currency labels used across the system
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_currency_check'
  ) THEN
    ALTER TABLE public.accounts
      ADD CONSTRAINT accounts_currency_check
      CHECK (currency IN ('شيكل','دينار','دولار'));
  END IF;
END$$;

-- 2) Extend RPC: add p_foreign_amount + p_exchange_rate at the END (named-arg safe)
CREATE OR REPLACE FUNCTION public.create_opening_balance_entry(
  p_user_id uuid,
  p_debit_account_code text,
  p_credit_account_code text,
  p_amount numeric,
  p_balance_date date DEFAULT CURRENT_DATE,
  p_description text DEFAULT 'رصيد افتتاحي'::text,
  p_currency text DEFAULT 'شيكل'::text,
  p_contact_id uuid DEFAULT NULL::uuid,
  p_reference text DEFAULT NULL::text,
  p_replace_existing boolean DEFAULT true,
  p_idempotency_key text DEFAULT NULL::text,
  p_foreign_amount numeric DEFAULT NULL,
  p_exchange_rate  numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing uuid;
  v_tx_id uuid;
  v_ref text;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','user required'); END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN jsonb_build_object('success',false,'error','amount must be > 0'); END IF;
  IF p_debit_account_code = p_credit_account_code THEN RETURN jsonb_build_object('success',false,'error','debit = credit'); END IF;
  IF p_idempotency_key IS NULL THEN p_idempotency_key := 'OB-'||gen_random_uuid()::text; END IF;

  -- Idempotency
  SELECT id INTO v_existing FROM public.transactions
  WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success',true,'duplicate',true,'transaction_id',v_existing);
  END IF;

  PERFORM public._fc_validate_postable_account(p_user_id, p_debit_account_code);
  PERFORM public._fc_validate_postable_account(p_user_id, p_credit_account_code);

  v_ref := COALESCE(p_reference, 'OB-'||to_char(now(),'YYYYMMDD-HH24MISS'));

  IF p_replace_existing THEN
    IF p_contact_id IS NOT NULL THEN
      UPDATE public.transactions SET is_deleted = true, updated_at = now()
      WHERE user_id = p_user_id
        AND contact_id = p_contact_id
        AND COALESCE(is_opening_balance, false) = true
        AND is_deleted = false;
    ELSE
      UPDATE public.transactions SET is_deleted = true, updated_at = now()
      WHERE user_id = p_user_id
        AND (debit_account_code = p_debit_account_code OR credit_account_code = p_debit_account_code)
        AND transaction_type = 'opening_balance'
        AND COALESCE(is_opening_balance, false) = true
        AND is_deleted = false
        AND contact_id IS NULL;
    END IF;
  END IF;

  INSERT INTO public.transactions(
    user_id, transaction_date, description, debit_account_code, credit_account_code,
    amount, currency, transaction_type, reference, idempotency_key,
    is_opening_balance, contact_id, foreign_amount, exchange_rate
  ) VALUES (
    p_user_id, p_balance_date, p_description,
    p_debit_account_code, p_credit_account_code,
    p_amount, p_currency, 'opening_balance', v_ref, p_idempotency_key,
    true, p_contact_id, p_foreign_amount, p_exchange_rate
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('success',true,'duplicate',false,'transaction_id',v_tx_id,'reference',v_ref);
END;
$function$;

-- 3) Helper to fetch latest mid-rate for a currency (Arabic name → currency_id)
CREATE OR REPLACE FUNCTION public.get_latest_exchange_rate(
  p_user_id uuid,
  p_currency_name text
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT er.mid_rate
  FROM public.exchange_rates er
  JOIN public.currencies c ON c.id = er.currency_id
  WHERE er.user_id = p_user_id
    AND (c.name_ar = p_currency_name OR c.code = p_currency_name)
  ORDER BY er.rate_date DESC
  LIMIT 1
$$;
