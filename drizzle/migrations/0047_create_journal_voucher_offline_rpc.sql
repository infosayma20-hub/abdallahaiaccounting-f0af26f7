-- Offline journal vouchers: replayed from the device outbox as ONE atomic call.
-- Produces exactly what the online save produces (voucher + lines + book number +
-- QV ref + stamped transactions), and is idempotent on (user_id, local_id).
CREATE OR REPLACE FUNCTION public.create_journal_voucher_offline(
  p_user_id uuid,
  p_local_id text,
  p_voucher jsonb,
  p_lines jsonb,
  p_txns jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing record;
  v_voucher_id uuid;
  v_ref text;
  v_book_id uuid;
  v_book_code text;
  v_book_number text;
  v_year int;
  v_seq int;
  v_date date;
  v_line jsonb;
  v_tx jsonb;
  v_i int := 0;
  v_first_tx uuid;
  v_tx_id uuid;
  v_total_d numeric := 0;
  v_total_c numeric := 0;
  v_desc text;
BEGIN
  PERFORM public.assert_owner_scope(p_user_id);
  IF p_local_id IS NULL OR btrim(p_local_id) = '' THEN
    RETURN jsonb_build_object('success',false,'error','local_id required');
  END IF;

  -- Idempotency: the same offline document can never be posted twice.
  SELECT id, ref_number, book_number INTO v_existing
    FROM public.vouchers WHERE user_id = p_user_id AND local_id = p_local_id LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('success',true,'duplicate',true,'id',v_existing.id,
      'voucher_id',v_existing.id,'ref_number',v_existing.ref_number,'book_number',v_existing.book_number);
  END IF;

  IF p_lines IS NULL OR jsonb_array_length(p_lines) < 2 THEN
    RETURN jsonb_build_object('success',false,'error','أدخل سطرين صالحين على الأقل');
  END IF;
  IF p_txns IS NULL OR jsonb_array_length(p_txns) = 0 THEN
    RETURN jsonb_build_object('success',false,'error','no journal pairs');
  END IF;

  v_date := (p_voucher->>'date')::date;
  IF v_date IS NULL THEN RETURN jsonb_build_object('success',false,'error','التاريخ مطلوب'); END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_total_d := v_total_d + COALESCE((v_line->>'debit')::numeric,0);
    v_total_c := v_total_c + COALESCE((v_line->>'credit')::numeric,0);
    PERFORM public._fc_validate_postable_account(p_user_id, v_line->>'account_code');
  END LOOP;
  IF abs(v_total_d - v_total_c) >= 0.01 OR v_total_d <= 0 THEN
    RETURN jsonb_build_object('success',false,'error','القيد غير متوازن');
  END IF;

  -- Journal book: requested book if it belongs to this tenant and is active, else default.
  v_book_id := NULLIF(p_voucher->>'book_id','')::uuid;
  IF v_book_id IS NOT NULL THEN
    SELECT id, code INTO v_book_id, v_book_code FROM public.journal_books
     WHERE id = v_book_id AND user_id = p_user_id AND is_active = true;
  END IF;
  IF v_book_id IS NULL THEN
    v_book_id := public.ensure_default_journal_book(p_user_id);
    SELECT code INTO v_book_code FROM public.journal_books WHERE id = v_book_id;
  END IF;
  v_year := EXTRACT(YEAR FROM v_date)::int;
  INSERT INTO public.journal_book_sequences(book_id, year, last_number)
  VALUES (v_book_id, v_year, 1)
  ON CONFLICT (book_id, year) DO UPDATE
    SET last_number = journal_book_sequences.last_number + 1, updated_at = now()
  RETURNING last_number INTO v_seq;
  v_book_number := v_book_code || '-' || v_year::text || '-' || LPAD(v_seq::text, 4, '0');

  v_desc := COALESCE(NULLIF(btrim(p_voucher->>'description'),''), NULLIF(btrim(p_voucher->>'notes'),''), v_book_number);

  INSERT INTO public.vouchers(
    user_id, type, subtype, ref_number, date, contact_id, cost_center_id,
    amount, amount_ils, currency, exchange_rate, description, notes, status,
    attachments, line_sort_order, book_id, book_number, local_id
  ) VALUES (
    p_user_id, 'journal', COALESCE(NULLIF(p_voucher->>'subtype',''),'normal'), NULL, v_date,
    NULLIF(p_voucher->>'contact_id','')::uuid, NULLIF(p_voucher->>'cost_center_id','')::uuid,
    v_total_d, v_total_d, 'ILS', 1, v_desc, NULLIF(p_voucher->>'notes',''), 'draft',
    '[]'::jsonb, COALESCE(NULLIF(p_voucher->>'line_sort_order',''),'original'),
    v_book_id, v_book_number, p_local_id
  ) RETURNING id, ref_number INTO v_voucher_id, v_ref;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_i := v_i + 1;
    INSERT INTO public.voucher_lines(voucher_id, account_code, account_name, debit, credit,
      line_order, contact_id, contact_name, line_comment, cost_center_id)
    VALUES (v_voucher_id, v_line->>'account_code', NULLIF(v_line->>'account_name',''),
      COALESCE((v_line->>'debit')::numeric,0), COALESCE((v_line->>'credit')::numeric,0), v_i,
      NULLIF(v_line->>'contact_id','')::uuid, NULLIF(v_line->>'contact_name',''),
      NULLIF(v_line->>'line_comment',''),
      COALESCE(NULLIF(v_line->>'cost_center_id','')::uuid, NULLIF(p_voucher->>'cost_center_id','')::uuid));
  END LOOP;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_txns) t
             WHERE t->>'debit_account_code' = '1199' OR t->>'credit_account_code' = '1199') THEN
    PERFORM public.ensure_party_transfer_clearing_account(p_user_id);
  END IF;

  FOR v_tx IN SELECT * FROM jsonb_array_elements(p_txns) LOOP
    IF COALESCE((v_tx->>'amount')::numeric,0) <= 0 THEN
      RAISE EXCEPTION 'amount > 0 required';
    END IF;
    INSERT INTO public.transactions(
      user_id, transaction_date, description, debit_account_code, credit_account_code,
      amount, currency, transaction_type, reference, idempotency_key, contact_id,
      cost_center_id, book_id, book_number
    ) VALUES (
      p_user_id, v_date,
      CASE WHEN NULLIF(v_tx->>'contact_name','') IS NOT NULL
           THEN v_desc || ' - ' || (v_tx->>'contact_name') ELSE v_desc END,
      v_tx->>'debit_account_code', v_tx->>'credit_account_code',
      (v_tx->>'amount')::numeric, 'شيكل',
      COALESCE(NULLIF(v_tx->>'transaction_type',''),'journal'), v_ref,
      'VOUCHER-' || v_voucher_id::text || '-' || COALESCE(NULLIF(v_tx->>'key_suffix',''), v_i::text),
      NULLIF(v_tx->>'contact_id','')::uuid, NULLIF(v_tx->>'cost_center_id','')::uuid,
      v_book_id, v_book_number
    ) RETURNING id INTO v_tx_id;
    IF v_first_tx IS NULL THEN v_first_tx := v_tx_id; END IF;
  END LOOP;

  UPDATE public.vouchers
     SET linked_transaction_id = v_first_tx, status = 'posted',
         posted_by = auth.uid(), posted_at = now()
   WHERE id = v_voucher_id;

  RETURN jsonb_build_object('success',true,'duplicate',false,'id',v_voucher_id,
    'voucher_id',v_voucher_id,'ref_number',v_ref,'book_number',v_book_number);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_journal_voucher_offline(uuid,text,jsonb,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_journal_voucher_offline(uuid,text,jsonb,jsonb,jsonb) TO authenticated;