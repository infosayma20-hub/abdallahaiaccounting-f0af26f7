CREATE OR REPLACE FUNCTION public.build_receipt_posting_intent_v1(
  p_owner_id uuid,
  p_context jsonb,
  p_payload jsonb,
  p_command_id uuid DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_amount numeric;
  v_currency text := COALESCE(NULLIF(p_payload->>'currency',''), 'شيكل');
  v_method text := COALESCE(NULLIF(p_payload->>'payment_method',''), 'نقدي');
  v_date date := COALESCE(NULLIF(p_payload->>'voucher_date','')::date, CURRENT_DATE);
  v_rate numeric := NULLIF(p_payload->>'exchange_rate','')::numeric;
  v_is_foreign boolean;
  v_use_rate boolean;
  v_roles jsonb;
  v_locked text;
BEGIN
  IF p_owner_id IS NULL THEN
    RAISE EXCEPTION 'posting intent: owner is required' USING ERRCODE = '22023';
  END IF;

  v_amount := NULLIF(p_payload->>'amount','')::numeric;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'posting intent: amount must be greater than zero' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_payload->'allocations') = 'array'
     AND jsonb_array_length(p_payload->'allocations') > 0 THEN
    RAISE EXCEPTION 'posting intent: allocation receipts are not supported by posting engine v1'
      USING ERRCODE = '0A000';
  END IF;

  v_is_foreign := (v_currency IS NOT NULL AND v_currency <> 'شيكل' AND v_currency <> 'ILS');
  v_use_rate   := (COALESCE(v_rate,0) > 0 AND v_rate <> 1);

  SELECT period_name INTO v_locked
    FROM public.fiscal_periods
   WHERE user_id = p_owner_id
     AND v_date >= start_date AND v_date <= end_date
     AND status IN ('closed','locked')
   LIMIT 1;
  IF v_locked IS NOT NULL THEN
    RAISE EXCEPTION 'الفترة المحاسبية "%" مغلقة. لا يمكن الترحيل بتاريخ %', v_locked, v_date
      USING ERRCODE = '55006';
  END IF;

  v_roles := public.resolve_receipt_account_roles_v1(
    p_owner_id, v_method,
    NULLIF(p_payload->>'cash_account_code',''),
    NULLIF(p_payload->>'contact_account_code',''),
    NULLIF(p_payload->>'contact_id','')::uuid,
    NULLIF(p_payload->>'contact_name',''),
    NULLIF(p_payload->>'employee_id','')::uuid
  );

  IF NOT EXISTS (SELECT 1 FROM public.accounts a
                  WHERE a.user_id = p_owner_id
                    AND a.account_code = v_roles->>'debit_account_code') THEN
    RAISE EXCEPTION 'الحساب المدين % غير موجود ضمن شجرة حسابات المؤسسة', v_roles->>'debit_account_code'
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts a
                  WHERE a.user_id = p_owner_id
                    AND a.account_code = v_roles->>'credit_account_code') THEN
    RAISE EXCEPTION 'الحساب الدائن % غير موجود ضمن شجرة حسابات المؤسسة', v_roles->>'credit_account_code'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public._fc_validate_postable_account(p_owner_id, v_roles->>'debit_account_code');
  PERFORM public._fc_validate_postable_account(p_owner_id, v_roles->>'credit_account_code');

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'posting_intent_version', 1,
    'posting_version', 1,
    'source_type', 'finance.receipt.command',
    'effect_type', 'receipt.gl',
    'command_id', p_command_id,
    'correlation_id', p_correlation_id,
    'owner_id', p_owner_id,
    'company_id', NULLIF(p_context->>'company_id','')::uuid,
    'branch_id', NULLIF(p_context->>'branch_id','')::uuid,
    'actor_id', NULLIF(p_context->>'actor_id','')::uuid,
    'effective_date', v_date,
    'currency', v_currency,
    'amount', v_amount,
    'base_amount', v_amount,
    'exchange_rate', CASE WHEN v_is_foreign AND v_use_rate THEN v_rate END,
    'foreign_amount', CASE WHEN v_is_foreign AND v_use_rate
                           THEN ROUND(v_amount / v_rate, 4) END,
    'debit_role', v_roles->>'debit_role',
    'credit_role', v_roles->>'credit_role',
    'debit_account_code', v_roles->>'debit_account_code',
    'credit_account_code', v_roles->>'credit_account_code',
    'contact_id', NULLIF(p_payload->>'contact_id','')::uuid,
    'payment_method', v_method,
    'balanced', true
  ));
END;
$fn$;

REVOKE ALL ON FUNCTION public.build_receipt_posting_intent_v1(uuid,jsonb,jsonb,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.build_receipt_posting_intent_v1(uuid,jsonb,jsonb,uuid,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.build_receipt_posting_intent_v1(uuid,jsonb,jsonb,uuid,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.build_receipt_posting_intent_v1(uuid,jsonb,jsonb,uuid,uuid) TO service_role;