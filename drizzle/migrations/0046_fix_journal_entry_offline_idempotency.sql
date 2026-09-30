CREATE OR REPLACE FUNCTION public.create_journal_entry_multi_party_atomic(p_user_id uuid, p_entry_date date, p_description text, p_lines jsonb, p_currency text DEFAULT 'شيكل'::text, p_reference text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_source text DEFAULT 'manual'::text, p_exchange_rate numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text, p_cost_center_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing uuid;
  v_first_id uuid;
  v_ref text;
  v_line jsonb;
  v_i int := 0;
  v_total_d numeric := 0;
  v_total_c numeric := 0;
  v_da text; v_ca text; v_amt numeric;
  v_idem text;
  v_line_cc uuid;
  v_use_rate boolean := (
    p_currency IS NOT NULL AND p_currency NOT IN ('شيكل','ILS')
    AND COALESCE(p_exchange_rate,0) > 0 AND p_exchange_rate <> 1
  );
BEGIN
  PERFORM public.assert_owner_scope(p_user_id);
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','user required'); END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RETURN jsonb_build_object('success',false,'error','no lines');
  END IF;
  v_idem := COALESCE(p_idempotency_key, 'JV-'||gen_random_uuid()::text);

  -- Lines are stored as <key>-L<n>; match those too (including voided rows) so a replay never re-posts.
  SELECT id INTO v_existing FROM public.transactions
   WHERE user_id=p_user_id AND (idempotency_key=v_idem OR idempotency_key LIKE v_idem||'-L%') LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success',true,'duplicate',true,'transaction_id',v_existing);
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_amt := COALESCE((v_line->>'amount')::numeric,0);
    IF v_amt <= 0 THEN RETURN jsonb_build_object('success',false,'error','amount > 0 required'); END IF;
    v_da := v_line->>'debit_account_code';
    v_ca := v_line->>'credit_account_code';
    IF v_da IS NULL OR v_ca IS NULL OR v_da = v_ca THEN
      RETURN jsonb_build_object('success',false,'error','invalid accounts in line');
    END IF;
    PERFORM public._fc_validate_postable_account(p_user_id, v_da);
    PERFORM public._fc_validate_postable_account(p_user_id, v_ca);
    v_total_d := v_total_d + v_amt;
    v_total_c := v_total_c + v_amt;
  END LOOP;

  v_ref := COALESCE(p_reference, 'JV-'||to_char(now(),'YYYYMMDD-HH24MISS'));

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_i := v_i + 1;
    v_amt := (v_line->>'amount')::numeric;
    v_line_cc := COALESCE(
      NULLIF(v_line->>'cost_center_id','')::uuid,
      p_cost_center_id
    );
    INSERT INTO public.transactions(
      user_id, transaction_date, description,
      debit_account_code, credit_account_code, amount, currency,
      transaction_type, reference, idempotency_key,
      contact_id, payment_method, notes,
      exchange_rate, foreign_amount, workshop_id, cost_center_id
    ) VALUES (
      p_user_id, p_entry_date,
      COALESCE(v_line->>'description', p_description),
      v_line->>'debit_account_code', v_line->>'credit_account_code',
      v_amt, p_currency,
      'manual_journal', v_ref, v_idem||'-L'||v_i,
      NULLIF(v_line->>'contact_id','')::uuid,
      v_line->>'payment_method',
      COALESCE(v_line->>'notes', p_notes),
      CASE WHEN v_use_rate THEN p_exchange_rate ELSE NULL END,
      CASE WHEN v_use_rate THEN ROUND(v_amt / p_exchange_rate, 6) ELSE NULL END,
      NULLIF(v_line->>'workshop_id','')::uuid,
      v_line_cc
    ) RETURNING id INTO v_first_id;
  END LOOP;

  RETURN jsonb_build_object('success',true,'duplicate',false,
    'transaction_id',v_first_id,'reference',v_ref,'lines',v_i,
    'idempotency_key', v_idem);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;