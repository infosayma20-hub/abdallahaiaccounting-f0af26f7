-- Stage 3D-1 — Service Credit Sales Invoice V1 (additive, OFF by default)

-- 1) Eligibility guard -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_service_credit_sales_invoice_eligibility_v1(
  p_owner_id uuid,
  p_payload  jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line jsonb;
  v_n int := 0;
  v_pid uuid;
  v_ptype text;
BEGIN
  IF p_owner_id IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'owner_required');
  END IF;
  IF COALESCE(p_payload->>'invoice_type','') NOT IN ('sale','sales') THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'unsupported_invoice_type');
  END IF;
  IF COALESCE(p_payload->>'payment_mode','') <> 'credit' THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'only_credit_invoices_supported');
  END IF;
  IF COALESCE(NULLIF(p_payload->>'paid_amount','')::numeric, 0) <> 0 THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'paid_amount_must_be_zero');
  END IF;
  IF NULLIF(p_payload->>'cash_account_code','') IS NOT NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'cash_invoice_not_supported');
  END IF;
  IF jsonb_typeof(p_payload->'allocations') = 'array'
     AND jsonb_array_length(p_payload->'allocations') > 0 THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'allocations_not_supported');
  END IF;
  IF COALESCE((p_payload->>'create_receipt')::boolean, false) THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'auto_receipt_not_supported');
  END IF;
  IF NULLIF(p_payload->>'order_id','') IS NOT NULL
     OR NULLIF(p_payload->>'source_delivery_note_id','') IS NOT NULL
     OR NULLIF(p_payload->>'workshop_id','') IS NOT NULL
     OR NULLIF(p_payload->>'warehouse_id','') IS NOT NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'linked_document_flow_not_supported');
  END IF;
  IF COALESCE(NULLIF(p_payload->>'source',''), 'manual') NOT IN ('manual','web') THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'unsupported_source');
  END IF;
  IF COALESCE((p_payload->>'as_draft')::boolean, false) THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'draft_not_supported');
  END IF;

  -- customer must exist inside the tenant
  IF NULLIF(p_payload->>'contact_id','') IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'contact_required');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contacts c
                  WHERE c.id = (p_payload->>'contact_id')::uuid
                    AND c.user_id = p_owner_id) THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'contact_not_in_tenant');
  END IF;

  IF jsonb_typeof(p_payload->'lines') <> 'array'
     OR jsonb_array_length(p_payload->'lines') = 0 THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'lines_required');
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'lines') LOOP
    v_n := v_n + 1;
    IF COALESCE(NULLIF(v_line->>'description',''), '') = '' THEN
      RETURN jsonb_build_object('eligible', false, 'reason', 'line_description_required');
    END IF;
    IF COALESCE(NULLIF(v_line->>'quantity','')::numeric, 0) <= 0 THEN
      RETURN jsonb_build_object('eligible', false, 'reason', 'line_quantity_invalid');
    END IF;
    IF COALESCE(NULLIF(v_line->>'unit_price','')::numeric, -1) < 0 THEN
      RETURN jsonb_build_object('eligible', false, 'reason', 'line_unit_price_invalid');
    END IF;
    IF COALESCE(NULLIF(v_line->>'bonus_quantity','')::numeric, 0) <> 0 THEN
      RETURN jsonb_build_object('eligible', false, 'reason', 'bonus_quantity_not_supported');
    END IF;
    v_pid := NULLIF(v_line->>'product_id','')::uuid;
    IF v_pid IS NOT NULL THEN
      SELECT p.product_type INTO v_ptype
        FROM public.products p
       WHERE p.id = v_pid AND p.user_id = p_owner_id;
      IF v_ptype IS NULL THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'product_not_in_tenant');
      END IF;
      IF v_ptype <> 'service' THEN
        RETURN jsonb_build_object('eligible', false, 'reason', 'stock_managed_product_not_supported');
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('eligible', true, 'line_count', v_n);
END;
$$;

-- 2) Trusted, server-side totals (mirror of the current UI rules) ------------
CREATE OR REPLACE FUNCTION public.compute_service_invoice_totals_v1(
  p_owner_id uuid,
  p_payload  jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tax_enabled boolean;
  v_inclusive boolean := COALESCE((p_payload->>'tax_inclusive')::boolean, false);
  v_line jsonb;
  v_base numeric; v_disc numeric; v_after numeric; v_net numeric;
  v_gross numeric := 0; v_items_disc numeric := 0; v_tax numeric := 0;
  v_base_total numeric := 0; v_subtotal numeric := 0;
  v_inv_raw numeric := COALESCE(NULLIF(p_payload->>'invoice_discount','')::numeric, 0);
  v_inv_disc numeric := 0;
  v_total numeric;
  v_lines jsonb := '[]'::jsonb;
  v_line_total numeric;
BEGIN
  SELECT COALESCE(cs.vat_enabled, true) INTO v_tax_enabled
    FROM public.company_settings cs WHERE cs.user_id = p_owner_id LIMIT 1;
  v_tax_enabled := COALESCE(v_tax_enabled, true);

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'lines') LOOP
    v_base := COALESCE(NULLIF(v_line->>'quantity','')::numeric,0)
            * COALESCE(NULLIF(v_line->>'unit_price','')::numeric,0);
    IF COALESCE(v_line->>'discount_type','amount') = 'percent' THEN
      v_disc := v_base * COALESCE(NULLIF(v_line->>'discount','')::numeric,0) / 100;
    ELSE
      v_disc := COALESCE(NULLIF(v_line->>'discount','')::numeric,0);
    END IF;
    v_after := v_base - v_disc;
    v_gross := v_gross + v_base;
    v_items_disc := v_items_disc + v_disc;

    IF NOT v_tax_enabled THEN
      v_line_total := v_after;
    ELSIF v_inclusive THEN
      v_net := v_after / (1 + COALESCE(NULLIF(v_line->>'tax_rate','')::numeric,0)/100);
      v_tax := v_tax + (v_after - v_net);
      v_line_total := v_after;
    ELSE
      v_tax := v_tax + v_after * COALESCE(NULLIF(v_line->>'tax_rate','')::numeric,0)/100;
      v_line_total := v_after + v_after * COALESCE(NULLIF(v_line->>'tax_rate','')::numeric,0)/100;
    END IF;

    v_lines := v_lines || jsonb_build_array(v_line || jsonb_build_object(
      'line_total', ROUND(v_line_total, 4),
      'line_revenue', ROUND(v_after, 4)
    ));
  END LOOP;

  IF NOT v_tax_enabled THEN
    v_base_total := v_gross - v_items_disc;
    v_subtotal := v_gross;
  ELSIF v_inclusive THEN
    v_base_total := v_gross - v_items_disc;
    v_subtotal := v_base_total - v_tax;
  ELSE
    v_base_total := (v_gross - v_items_disc) + v_tax;
    v_subtotal := v_gross;
  END IF;

  IF COALESCE(p_payload->>'invoice_discount_type','amount') = 'percent' THEN
    v_inv_disc := v_base_total * v_inv_raw / 100;
  ELSE
    v_inv_disc := v_inv_raw;
  END IF;
  IF v_inv_disc < 0 THEN v_inv_disc := 0; END IF;
  IF v_inv_disc > v_base_total THEN v_inv_disc := v_base_total; END IF;

  v_total := v_base_total - v_inv_disc;

  RETURN jsonb_build_object(
    'tax_enabled', v_tax_enabled,
    'tax_inclusive', v_inclusive,
    'subtotal', ROUND(v_subtotal, 4),
    'items_discount', ROUND(v_items_disc, 4),
    'invoice_discount', ROUND(v_inv_disc, 4),
    'total_discount', ROUND(v_items_disc + v_inv_disc, 4),
    'tax_amount', ROUND(v_tax, 4),
    'total_amount', ROUND(v_total, 4),
    'lines', v_lines
  );
END;
$$;

-- 3) Posting intent -----------------------------------------------------------
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
  v_ar text := '1130';
  v_rev text := '4100';
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
  -- legacy invoice convention: transactions.amount holds the ILS base = total * rate
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

  IF NOT EXISTS (SELECT 1 FROM public.accounts a
                  WHERE a.user_id = p_owner_id AND a.account_code = v_ar) THEN
    RAISE EXCEPTION 'حساب الذمم % غير موجود ضمن شجرة حسابات المؤسسة', v_ar USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts a
                  WHERE a.user_id = p_owner_id AND a.account_code = v_rev) THEN
    RAISE EXCEPTION 'حساب الإيرادات % غير موجود ضمن شجرة حسابات المؤسسة', v_rev USING ERRCODE = '42501';
  END IF;
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
    'credit_role', 'SALES_REVENUE',
    'debit_account_code', v_ar,
    'credit_account_code', v_rev,
    'contact_id', NULLIF(p_payload->>'contact_id','')::uuid,
    'payment_method', 'آجل',
    'balanced', true
  ));
END;
$$;

-- 4) Shadow comparison: client-declared vs server-trusted ---------------------
CREATE OR REPLACE FUNCTION public.shadow_compare_service_invoice_v1(
  p_payload jsonb,
  p_totals  jsonb,
  p_intent  jsonb
) RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d jsonb := COALESCE(p_payload->'declared_totals', '{}'::jsonb);
  diffs text[] := '{}';
  tol numeric := 0.005;
  fn text;
BEGIN
  IF d = '{}'::jsonb THEN
    RETURN jsonb_build_object('match', null, 'reason', 'no_declared_totals');
  END IF;
  FOREACH fn IN ARRAY ARRAY['subtotal','total_discount','tax_amount','total_amount'] LOOP
    IF d ? fn AND ABS(COALESCE((d->>fn)::numeric,0) - COALESCE((p_totals->>fn)::numeric,0)) > tol THEN
      diffs := diffs || fn;
    END IF;
  END LOOP;
  IF d ? 'currency' AND COALESCE(d->>'currency','') <> COALESCE(p_intent->>'currency','') THEN
    diffs := diffs || 'currency';
  END IF;
  IF d ? 'line_count'
     AND COALESCE((d->>'line_count')::int,0) <> jsonb_array_length(COALESCE(p_totals->'lines','[]'::jsonb)) THEN
    diffs := diffs || 'line_count';
  END IF;
  RETURN jsonb_build_object(
    'match', COALESCE(array_length(diffs,1),0) = 0,
    'differences', to_jsonb(diffs),
    'posting_version', 1
  );
END;
$$;

-- 5) Atomic writer -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_service_credit_sales_invoice_v1(
  p_intent  jsonb,
  p_payload jsonb,
  p_totals  jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid := (p_intent->>'owner_id')::uuid;
  v_source_id uuid := (p_intent->>'command_id')::uuid;
  v_idem text := NULLIF(p_payload->>'idempotency_key','');
  v_intent_row public.posting_intents_v1%ROWTYPE;
  v_started timestamptz := clock_timestamp();
  v_invoice_id uuid;
  v_invoice_number text;
  v_tx_id uuid;
  v_line jsonb;
  v_contact_id uuid := NULLIF(p_payload->>'contact_id','')::uuid;
  v_total numeric := (p_totals->>'total_amount')::numeric;
  v_currency text := p_intent->>'currency';
  v_rate numeric := NULLIF(p_intent->>'exchange_rate','')::numeric;
BEGIN
  IF v_owner IS NULL OR v_source_id IS NULL THEN
    RAISE EXCEPTION 'invoice engine: owner_id and command_id are required' USING ERRCODE = '22023';
  END IF;
  IF (p_intent->>'effect_type') <> 'sales_invoice.gl' THEN
    RAISE EXCEPTION 'invoice engine: unsupported effect_type' USING ERRCODE = '22023';
  END IF;
  IF v_idem IS NULL THEN
    RAISE EXCEPTION 'invoice engine: idempotency_key is required' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_owner_scope(v_owner);

  SELECT * INTO v_intent_row FROM public.posting_intents_v1
   WHERE owner_id = v_owner
     AND source_type = p_intent->>'source_type'
     AND source_id = v_source_id
     AND effect_type = p_intent->>'effect_type'
     AND posting_version = (p_intent->>'posting_version')::int
     AND status = 'active'
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true,
      'transaction_id', v_intent_row.transaction_id,
      'posting_intent_id', v_intent_row.id, 'posting_version', 1);
  END IF;

  IF COALESCE((p_intent->>'amount')::numeric,0) <= 0
     OR COALESCE((p_intent->>'base_amount')::numeric,-1)
        IS DISTINCT FROM COALESCE((p_intent->>'amount')::numeric,0) THEN
    RAISE EXCEPTION 'invoice engine: unbalanced intent' USING ERRCODE = '22023';
  END IF;

  -- 5.1 invoice header (numbering + tax ledger triggers run here)
  INSERT INTO public.invoices(
    user_id, invoice_type, contact_id, contact_name,
    invoice_date, due_date, subtotal, discount_amount, tax_amount,
    total_amount, paid_amount, remaining_amount, payment_status,
    payment_method, currency, exchange_rate, tax_inclusive,
    notes, payment_terms, status, source
  ) VALUES (
    v_owner, 'sale', v_contact_id, NULLIF(p_payload->>'contact_name',''),
    (p_intent->>'effective_date')::date,
    NULLIF(p_payload->>'due_date','')::date,
    (p_totals->>'subtotal')::numeric,
    (p_totals->>'total_discount')::numeric,
    (p_totals->>'tax_amount')::numeric,
    v_total, 0, v_total, 'unpaid',
    'آجل', v_currency, COALESCE(v_rate, 1),
    COALESCE((p_payload->>'tax_inclusive')::boolean, false),
    NULLIF(p_payload->>'notes',''),
    COALESCE(NULLIF(p_payload->>'payment_terms',''), 'net_30'),
    'sent', COALESCE(NULLIF(p_payload->>'source',''), 'manual')
  ) RETURNING id, invoice_number INTO v_invoice_id, v_invoice_number;

  -- 5.2 lines (service only — the stock trigger is a no-op for them)
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_totals->'lines') LOOP
    INSERT INTO public.invoice_items(
      invoice_id, product_id, product_name, quantity, bonus_quantity,
      unit_price, discount, discount_type, tax_rate, total_amount, unit_of_measure
    ) VALUES (
      v_invoice_id,
      NULLIF(v_line->>'product_id','')::uuid,
      v_line->>'description',
      COALESCE(NULLIF(v_line->>'quantity','')::numeric,0),
      0,
      COALESCE(NULLIF(v_line->>'unit_price','')::numeric,0),
      COALESCE(NULLIF(v_line->>'discount','')::numeric,0),
      COALESCE(NULLIF(v_line->>'discount_type',''), 'amount'),
      COALESCE(NULLIF(v_line->>'tax_rate','')::numeric,0),
      (v_line->>'line_revenue')::numeric,
      NULLIF(v_line->>'unit_of_measure','')
    );
  END LOOP;

  -- 5.3 GL effect (same shape as the legacy direct insert)
  INSERT INTO public.transactions(
    user_id, transaction_date, description,
    debit_account_code, credit_account_code, amount, currency,
    foreign_amount, exchange_rate, transaction_type, contact_id,
    reference, payment_method, idempotency_key
  ) VALUES (
    v_owner,
    (p_intent->>'effective_date')::date,
    'فاتورة مبيعات ' || COALESCE(v_invoice_number, v_invoice_id::text)
      || ' - ' || COALESCE(NULLIF(p_payload->>'contact_name',''), ''),
    p_intent->>'debit_account_code',
    p_intent->>'credit_account_code',
    (p_intent->>'amount')::numeric,
    v_currency,
    NULLIF(p_intent->>'foreign_amount','')::numeric,
    v_rate,
    'sale_credit',
    v_contact_id,
    v_invoice_number,
    'آجل',
    'INV-' || v_invoice_id::text
  ) RETURNING id INTO v_tx_id;

  UPDATE public.invoices SET linked_transaction_id = v_tx_id
   WHERE id = v_invoice_id AND user_id = v_owner;

  -- 5.4 compatibility cache effect (NOT the accounting source of truth)
  IF v_contact_id IS NOT NULL THEN
    UPDATE public.contacts
       SET current_balance = COALESCE(current_balance, 0) + v_total
     WHERE id = v_contact_id AND user_id = v_owner;
  END IF;

  INSERT INTO public.invoice_activity_log(invoice_id, user_id, action, details)
  VALUES (v_invoice_id, v_owner, 'created',
          jsonb_build_object('total', v_total, 'payment_method', 'آجل', 'posting_version', 1));

  -- 5.5 immutable posting intent record (written once, final)
  INSERT INTO public.posting_intents_v1(
    owner_id, company_id, branch_id, actor_id,
    source_type, source_id, effect_type, posting_version,
    command_id, correlation_id, effective_date, currency,
    amount, base_amount, exchange_rate,
    debit_role, credit_role, debit_account_code, credit_account_code,
    contact_id, status, transaction_id, effect_count, duration_ms, result_code
  ) VALUES (
    v_owner,
    NULLIF(p_intent->>'company_id','')::uuid,
    NULLIF(p_intent->>'branch_id','')::uuid,
    NULLIF(p_intent->>'actor_id','')::uuid,
    p_intent->>'source_type', v_source_id, p_intent->>'effect_type',
    (p_intent->>'posting_version')::int,
    (p_intent->>'command_id')::uuid,
    NULLIF(p_intent->>'correlation_id','')::uuid,
    (p_intent->>'effective_date')::date,
    v_currency,
    (p_intent->>'amount')::numeric,
    (p_intent->>'base_amount')::numeric,
    v_rate,
    p_intent->>'debit_role', p_intent->>'credit_role',
    p_intent->>'debit_account_code', p_intent->>'credit_account_code',
    v_contact_id,
    'active', v_tx_id, 1,
    GREATEST(0, (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::int),
    'posted'
  );

  RETURN jsonb_build_object(
    'success', true, 'duplicate', false,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'transaction_id', v_tx_id,
    'posting_version', 1
  );
END;
$$;

-- 6) Command entry point -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_service_credit_sales_invoice_command_v1(
  p_envelope jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ctx jsonb;
  v_actor uuid;
  v_owner uuid;
  v_payload jsonb := COALESCE(p_envelope->'payload', '{}'::jsonb);
  v_command_id uuid := COALESCE(NULLIF(p_envelope->>'command_id','')::uuid, gen_random_uuid());
  v_correlation uuid := NULLIF(p_envelope->>'correlation_id','')::uuid;
  v_causation uuid := NULLIF(p_envelope->>'causation_id','')::uuid;
  v_source text := COALESCE(NULLIF(p_envelope->>'source',''), 'web');
  v_device text := NULLIF(p_envelope->>'device_id','');
  v_idem text := NULLIF(p_envelope->>'idempotency_key','');
  v_started timestamptz := clock_timestamp();
  v_row_id uuid;
  v_existing_cmd public.business_commands%ROWTYPE;
  v_elig jsonb;
  v_totals jsonb;
  v_intent jsonb;
  v_shadow jsonb;
  v_rpc jsonb;
  v_result jsonb;
  v_event_id uuid;
  v_use_engine boolean;
BEGIN
  IF COALESCE(p_envelope->>'command_type','') <> 'finance.create_service_credit_sales_invoice.v1' THEN
    RAISE EXCEPTION 'unsupported command_type' USING ERRCODE = '22023';
  END IF;
  IF COALESCE((p_envelope->>'schema_version')::int, 0) <> 1 THEN
    RAISE EXCEPTION 'unsupported schema_version' USING ERRCODE = '22023';
  END IF;
  IF v_idem IS NULL THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  -- existing Unify authorization rules for creating a sales invoice
  IF NOT public.accountant_perm('can_create_sale_invoice') THEN
    RAISE EXCEPTION 'ليس لديك صلاحية إنشاء فاتورة مبيعات' USING ERRCODE = '42501';
  END IF;

  v_ctx   := public.resolve_command_context_v1(
               v_source,
               NULLIF(p_envelope->>'company_id','')::uuid,
               NULLIF(p_envelope->>'branch_id','')::uuid,
               v_device);
  v_actor := (v_ctx->>'actor_id')::uuid;
  v_owner := (v_ctx->>'owner_id')::uuid;

  IF NOT public.user_can_access(v_actor, 'invoices') THEN
    RAISE EXCEPTION 'ليس لديك صلاحية الوصول لشاشة الفواتير' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_command_flag_enabled_v1(v_owner, 'commands.invoice_service_credit_v1') THEN
    RETURN jsonb_build_object('version', 1, 'status', 'unsupported',
      'reason', 'command_disabled', 'route', 'legacy');
  END IF;

  v_elig := public.check_service_credit_sales_invoice_eligibility_v1(v_owner, v_payload);
  IF NOT COALESCE((v_elig->>'eligible')::boolean, false) THEN
    RETURN jsonb_build_object('version', 1, 'status', 'unsupported',
      'reason', v_elig->>'reason', 'route', 'legacy');
  END IF;

  INSERT INTO public.business_commands (
    command_id, command_type, schema_version,
    resolved_actor_id, resolved_owner_id,
    resolved_company_id, resolved_branch_id,
    source, device_id, idempotency_key,
    correlation_id, causation_id, status,
    payload_digest, started_at
  ) VALUES (
    v_command_id, 'finance.create_service_credit_sales_invoice.v1', 1,
    v_actor, v_owner,
    NULLIF(v_ctx->>'company_id','')::uuid, NULLIF(v_ctx->>'branch_id','')::uuid,
    v_source, v_device, v_idem,
    v_correlation, v_causation, 'running',
    encode(extensions.digest(v_payload::text, 'sha256'), 'hex'), v_started
  )
  ON CONFLICT (resolved_owner_id, command_type, idempotency_key) DO NOTHING
  RETURNING id INTO v_row_id;

  IF v_row_id IS NULL THEN
    SELECT * INTO v_existing_cmd
      FROM public.business_commands
     WHERE resolved_owner_id = v_owner
       AND command_type = 'finance.create_service_credit_sales_invoice.v1'
       AND idempotency_key = v_idem
     LIMIT 1;
    IF v_existing_cmd.status = 'succeeded' THEN
      RETURN jsonb_build_object(
        'version', 1, 'status', 'succeeded',
        'command_id', v_existing_cmd.command_id,
        'replayed', true,
        'correlation_id', v_existing_cmd.correlation_id
      ) || COALESCE(v_existing_cmd.result_reference, '{}'::jsonb);
    END IF;
    v_row_id := v_existing_cmd.id;
    v_command_id := v_existing_cmd.command_id;
  END IF;

  BEGIN
    v_totals := public.compute_service_invoice_totals_v1(v_owner, v_payload);
    v_intent := public.build_invoice_posting_intent_v1(
                  v_owner, v_ctx, v_payload, v_totals, v_command_id, v_correlation);
    v_shadow := public.shadow_compare_service_invoice_v1(v_payload, v_totals, v_intent);

    IF COALESCE((v_shadow->>'match')::boolean, true) IS FALSE THEN
      RAISE EXCEPTION 'totals mismatch with client declaration: %', v_shadow->>'differences'
        USING ERRCODE = '22023';
    END IF;

    v_use_engine := public.is_command_flag_enabled_v1(v_owner, 'posting.invoice_service_credit_v1');
    IF NOT v_use_engine THEN
      -- SHADOW ONLY: nothing is written, the caller keeps using the legacy screen.
      UPDATE public.business_commands
         SET status = 'succeeded',
             completed_at = clock_timestamp(),
             duration_ms = GREATEST(0, (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::int),
             result_reference = jsonb_build_object('mode','shadow','totals',v_totals,'shadow',v_shadow)
       WHERE id = v_row_id;
      RETURN jsonb_build_object('version', 1, 'status', 'shadow',
        'command_id', v_command_id, 'correlation_id', v_correlation,
        'totals', v_totals, 'intent', v_intent, 'shadow', v_shadow, 'route', 'legacy');
    END IF;

    v_rpc := public.post_service_credit_sales_invoice_v1(v_intent, v_payload
               || jsonb_build_object('idempotency_key', v_idem), v_totals);
  EXCEPTION WHEN OTHERS THEN
    v_rpc := jsonb_build_object('success', false, 'error', SQLERRM);
  END;

  IF COALESCE((v_rpc->>'success')::boolean, false) IS NOT TRUE THEN
    UPDATE public.business_commands
       SET status = 'failed',
           completed_at = clock_timestamp(),
           duration_ms = GREATEST(0, (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::int),
           error_code = LEFT(COALESCE(v_rpc->>'error','unknown_error'), 300)
     WHERE id = v_row_id;
    RETURN jsonb_build_object('version', 1, 'status', 'failed',
      'command_id', v_command_id, 'replayed', false,
      'correlation_id', v_correlation,
      'error', COALESCE(v_rpc->>'error','unknown_error'));
  END IF;

  v_result := jsonb_build_object(
    'invoice_id', v_rpc->>'invoice_id',
    'invoice_number', v_rpc->>'invoice_number',
    'transaction_id', v_rpc->>'transaction_id',
    'posting_intent_id', v_rpc->>'posting_intent_id',
    'posting_version', 1,
    'totals', v_totals,
    'shadow', COALESCE(v_shadow, 'null'::jsonb)
  );

  UPDATE public.business_commands
     SET status = 'succeeded',
         completed_at = clock_timestamp(),
         duration_ms = GREATEST(0, (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::int),
         result_reference = v_result,
         error_code = NULL
   WHERE id = v_row_id;

  IF public.is_command_flag_enabled_v1(v_owner, 'events.invoice_service_credit_v1') THEN
    v_event_id := public.emit_domain_event_v1(
      'finance.sales_invoice.created.v1', 1,
      'finance.sales_invoice', NULLIF(v_rpc->>'invoice_id','')::uuid,
      v_owner, v_actor,
      NULLIF(v_ctx->>'company_id','')::uuid,
      NULLIF(v_ctx->>'branch_id','')::uuid,
      v_command_id, v_correlation, v_causation,
      'finance.create_service_credit_sales_invoice.v1:' || v_idem,
      NULLIF(v_payload->>'invoice_date','')::timestamptz,
      jsonb_strip_nulls(jsonb_build_object(
        'schema_version', 1,
        'invoice_id', v_rpc->>'invoice_id',
        'transaction_id', v_rpc->>'transaction_id',
        'posting_version', 1,
        'currency', v_intent->>'currency',
        'line_count', jsonb_array_length(COALESCE(v_totals->'lines','[]'::jsonb)),
        'amount_bucket', CASE
            WHEN (v_totals->>'total_amount')::numeric < 100    THEN 'lt_100'
            WHEN (v_totals->>'total_amount')::numeric < 1000   THEN 'lt_1k'
            WHEN (v_totals->>'total_amount')::numeric < 10000  THEN 'lt_10k'
            WHEN (v_totals->>'total_amount')::numeric < 100000 THEN 'lt_100k'
            ELSE 'gte_100k' END,
        'source', v_source
      ))
    );
  END IF;

  RETURN jsonb_build_object(
    'version', 1, 'status', 'succeeded',
    'command_id', v_command_id,
    'replayed', COALESCE((v_rpc->>'duplicate')::boolean, false),
    'correlation_id', v_correlation
  ) || v_result
    || CASE WHEN v_event_id IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object('event_id', v_event_id) END;
END;
$$;

-- 7) Privileges: engine internals are service-role only; only the command is callable
REVOKE ALL ON FUNCTION public.check_service_credit_sales_invoice_eligibility_v1(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.compute_service_invoice_totals_v1(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.build_invoice_posting_intent_v1(uuid, jsonb, jsonb, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shadow_compare_service_invoice_v1(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_service_credit_sales_invoice_v1(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_service_credit_sales_invoice_command_v1(jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.check_service_credit_sales_invoice_eligibility_v1(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.compute_service_invoice_totals_v1(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.build_invoice_posting_intent_v1(uuid, jsonb, jsonb, jsonb, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.shadow_compare_service_invoice_v1(jsonb, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_service_credit_sales_invoice_v1(jsonb, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_service_credit_sales_invoice_command_v1(jsonb) TO authenticated, service_role;