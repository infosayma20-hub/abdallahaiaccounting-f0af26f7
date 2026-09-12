-- Internal (owner-scoped, no auth context) role resolution helpers
CREATE OR REPLACE FUNCTION public._resolve_role_account_code_v1(p_owner uuid, p_role text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_code text; v_count int;
BEGIN
  IF p_owner IS NULL THEN
    RAISE EXCEPTION 'account_role: owner is required' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.account_system_roles_v1 r
    JOIN public.accounts a ON a.id = r.account_id
   WHERE r.owner_id = p_owner AND r.role = p_role
     AND a.user_id = p_owner
     AND COALESCE(a.is_active, true) = true
     AND a.account_code IS DISTINCT FROM a.parent_code
     AND NOT EXISTS (SELECT 1 FROM public.accounts c
                      WHERE c.user_id = a.user_id AND c.parent_code = a.account_code
                        AND COALESCE(c.is_active, true) = true);

  IF v_count = 0 THEN
    RAISE EXCEPTION 'account_role: role % is not configured for this company', p_role USING ERRCODE = 'P0002';
  ELSIF v_count > 1 THEN
    RAISE EXCEPTION 'account_role: role % is ambiguous for this company', p_role USING ERRCODE = '22023';
  END IF;

  SELECT a.account_code INTO v_code
    FROM public.account_system_roles_v1 r
    JOIN public.accounts a ON a.id = r.account_id
   WHERE r.owner_id = p_owner AND r.role = p_role;

  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public._resolve_customer_ar_code_v1(p_owner uuid, p_contact_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_code text; v_count int;
BEGIN
  IF p_contact_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = p_contact_id AND c.user_id = p_owner) THEN
      RAISE EXCEPTION 'account_role: contact does not belong to this company' USING ERRCODE = '42501';
    END IF;

    SELECT count(*) INTO v_count
      FROM public.accounts a
     WHERE a.user_id = p_owner AND a.contact_id = p_contact_id
       AND COALESCE(a.is_active, true) = true
       AND a.account_code IS DISTINCT FROM a.parent_code
       AND NOT EXISTS (SELECT 1 FROM public.accounts c
                        WHERE c.user_id = a.user_id AND c.parent_code = a.account_code
                          AND COALESCE(c.is_active, true) = true);

    IF v_count = 1 THEN
      SELECT a.account_code INTO v_code
        FROM public.accounts a
       WHERE a.user_id = p_owner AND a.contact_id = p_contact_id
         AND COALESCE(a.is_active, true) = true
       LIMIT 1;
      RETURN v_code;
    ELSIF v_count > 1 THEN
      RAISE EXCEPTION 'account_role: contact has multiple postable accounts' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN public._resolve_role_account_code_v1(p_owner, 'ACCOUNTS_RECEIVABLE');
END;
$$;

REVOKE ALL ON FUNCTION public._resolve_role_account_code_v1(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._resolve_customer_ar_code_v1(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._resolve_role_account_code_v1(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public._resolve_customer_ar_code_v1(uuid, uuid) TO service_role;

-- Invoice V1 intent now resolves accounts by role instead of hard-coded 1130/4100
CREATE OR REPLACE FUNCTION public.build_invoice_posting_intent_v1(
  p_owner_id       uuid,
  p_context        jsonb,
  p_payload        jsonb,
  p_totals         jsonb,
  p_command_id     uuid,
  p_correlation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date date := COALESCE(NULLIF(p_payload->>'invoice_date','')::date, CURRENT_DATE);
  v_currency text := COALESCE(NULLIF(p_payload->>'currency',''), 'شيكل');
  v_rate numeric := NULLIF(p_payload->>'exchange_rate','')::numeric;
  v_is_foreign boolean;
  v_use_rate boolean;
  v_total numeric := (p_totals->>'total_amount')::numeric;
  v_base numeric;
  v_contact uuid := NULLIF(p_payload->>'contact_id','')::uuid;
  v_ar text;
  v_rev text;
  v_locked text;
BEGIN
  IF p_owner_id IS NULL THEN
    RAISE EXCEPTION 'posting intent: owner is required' USING ERRCODE = '22023';
  END IF;
  IF v_total IS NULL OR v_total <= 0 THEN
    RAISE EXCEPTION 'posting intent: invoice total must be greater than zero' USING ERRCODE = '22023';
  END IF;

  v_is_foreign := (v_currency <> 'شيكل' AND v_currency <> 'ILS');
  v_use_rate   := (COALESCE(v_rate,0) > 0 AND v_rate <> 1);
  v_base := CASE WHEN v_is_foreign AND v_use_rate THEN ROUND(v_total * v_rate, 4) ELSE v_total END;

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

  -- Account Role Foundation V1: fail closed, never post to a parent account
  v_ar  := public._resolve_customer_ar_code_v1(p_owner_id, v_contact);
  v_rev := public._resolve_role_account_code_v1(p_owner_id, 'SERVICE_SALES_REVENUE');

  PERFORM public._fc_validate_postable_account(p_owner_id, v_ar);
  PERFORM public._fc_validate_postable_account(p_owner_id, v_rev);

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'posting_intent_version', 1,
    'posting_version', 1,
    'source_type', 'finance.sales_invoice.command',
    'effect_type', 'sales_invoice.gl',
    'command_id', p_command_id,
    'correlation_id', p_correlation_id,
    'owner_id', p_owner_id,
    'company_id', NULLIF(p_context->>'company_id','')::uuid,
    'branch_id', NULLIF(p_context->>'branch_id','')::uuid,
    'actor_id', NULLIF(p_context->>'actor_id','')::uuid,
    'effective_date', v_date,
    'currency', v_currency,
    'amount', v_base,
    'base_amount', v_base,
    'document_amount', v_total,
    'exchange_rate', CASE WHEN v_is_foreign AND v_use_rate THEN v_rate END,
    'foreign_amount', CASE WHEN v_is_foreign AND v_use_rate THEN v_total END,
    'debit_role', 'ACCOUNTS_RECEIVABLE',
    'credit_role', 'SERVICE_SALES_REVENUE',
    'debit_account_code', v_ar,
    'credit_account_code', v_rev,
    'contact_id', v_contact,
    'payment_method', 'آجل',
    'balanced', true
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.build_invoice_posting_intent_v1(uuid, jsonb, jsonb, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.build_invoice_posting_intent_v1(uuid, jsonb, jsonb, jsonb, uuid, uuid) TO service_role;