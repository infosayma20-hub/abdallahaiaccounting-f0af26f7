CREATE OR REPLACE FUNCTION public.reverse_voucher_transactions(p_voucher_id uuid, p_owner_id uuid, p_reason text DEFAULT 'تعديل سند')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_caller_owner uuid; v_voucher_owner uuid; v_ref text;
  r public.transactions%ROWTYPE; v_new uuid; v_n integer := 0;
  v_stamp text := to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_voucher_id IS NULL OR p_owner_id IS NULL THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
  v_caller_owner := public.resolve_effective_owner_id(auth.uid());
  IF v_caller_owner IS NULL OR v_caller_owner <> p_owner_id THEN RAISE EXCEPTION 'forbidden_owner_mismatch'; END IF;
  SELECT user_id, ref_number INTO v_voucher_owner, v_ref FROM public.vouchers WHERE id = p_voucher_id FOR UPDATE;
  IF v_voucher_owner IS NULL THEN RAISE EXCEPTION 'voucher_not_found'; END IF;
  IF v_voucher_owner <> p_owner_id THEN RAISE EXCEPTION 'voucher_owner_mismatch'; END IF;

  FOR r IN
    SELECT * FROM public.transactions t
     WHERE t.user_id = p_owner_id
       AND t.idempotency_key ILIKE 'VOUCHER-' || p_voucher_id::text || '%'
       AND COALESCE(t.is_deleted,false) = false
       AND COALESCE(t.transaction_type,'') <> 'reversal'
       AND t.reversed_by_id IS NULL
     FOR UPDATE
  LOOP
    INSERT INTO public.transactions (
      user_id, transaction_date, description, debit_account_code, credit_account_code,
      account_id_debit, account_id_credit, amount, currency, transaction_type, reference,
      contact_id, payment_method, foreign_amount, exchange_rate, expense_category, workshop_id,
      cost_center_name, cost_center_id, sales_rep_id, book_id, reversed_by_id, notes, is_deleted, idempotency_key)
    VALUES (
      r.user_id, r.transaction_date, 'عكس قيد (تعديل): ' || COALESCE(r.description,''),
      r.credit_account_code, r.debit_account_code, r.account_id_credit, r.account_id_debit,
      r.amount, r.currency, 'reversal', r.reference, r.contact_id, r.payment_method,
      r.foreign_amount, r.exchange_rate, r.expense_category, r.workshop_id,
      r.cost_center_name, r.cost_center_id, r.sales_rep_id, r.book_id, r.id, p_reason, false,
      'VOUCHER-' || p_voucher_id::text || '-REV-' || r.id::text)
    RETURNING id INTO v_new;
    -- release the original key so the rebuilt entry can reuse stable keys
    UPDATE public.transactions
       SET reversed_by_id = v_new,
           idempotency_key = r.idempotency_key || '-OLD-' || v_stamp
     WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.reverse_voucher_transactions(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_voucher_transactions(uuid, uuid, text) TO authenticated, service_role;