
CREATE OR REPLACE FUNCTION public.get_accounting_center_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_cash numeric := 0;
  v_bank numeric := 0;
  v_ar   numeric := 0;
  v_ap   numeric := 0;
  v_cust_prepay numeric := 0;
  v_supp_advance numeric := 0;
  v_drift jsonb;
  v_recent_journal jsonb;
  v_recent_vouchers jsonb;
  v_recent_invoices jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error','unauthenticated');
  END IF;

  -- Single scan using FILTER aggregates + explicit is_deleted=false (matches partial indexes)
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE debit_account_code  LIKE '111%'), 0)
      - COALESCE(SUM(amount) FILTER (WHERE credit_account_code LIKE '111%'), 0),
    COALESCE(SUM(amount) FILTER (WHERE debit_account_code  LIKE '112%'), 0)
      - COALESCE(SUM(amount) FILTER (WHERE credit_account_code LIKE '112%'), 0),
    COALESCE(SUM(amount) FILTER (WHERE debit_account_code  LIKE '113%'), 0)
      - COALESCE(SUM(amount) FILTER (WHERE credit_account_code LIKE '113%'), 0),
    COALESCE(SUM(amount) FILTER (WHERE credit_account_code LIKE '211%'), 0)
      - COALESCE(SUM(amount) FILTER (WHERE debit_account_code  LIKE '211%'), 0),
    COALESCE(SUM(amount) FILTER (WHERE credit_account_code LIKE '2115%'), 0)
      - COALESCE(SUM(amount) FILTER (WHERE debit_account_code  LIKE '2115%'), 0),
    COALESCE(SUM(amount) FILTER (WHERE debit_account_code  LIKE '1146%'), 0)
      - COALESCE(SUM(amount) FILTER (WHERE credit_account_code LIKE '1146%'), 0)
  INTO v_cash, v_bank, v_ar, v_ap, v_cust_prepay, v_supp_advance
  FROM transactions
  WHERE user_id = v_user
    AND is_deleted = false;

  SELECT jsonb_build_object(
    'tx_no_idempotency', (SELECT count(*) FROM transactions WHERE user_id=v_user AND is_deleted=false AND (idempotency_key IS NULL OR idempotency_key='')),
    'tx_no_reference',   (SELECT count(*) FROM transactions WHERE user_id=v_user AND is_deleted=false AND (reference IS NULL OR reference='')),
    'tx_zero_amount',    (SELECT count(*) FROM transactions WHERE user_id=v_user AND is_deleted=false AND COALESCE(amount,0)=0),
    'tx_same_account',   (SELECT count(*) FROM transactions WHERE user_id=v_user AND is_deleted=false AND debit_account_code = credit_account_code),
    'invoice_no_link',   (SELECT count(*) FROM invoices i WHERE i.user_id=v_user
                            AND NOT EXISTS (SELECT 1 FROM transactions t2 WHERE t2.user_id=v_user AND t2.reference = i.invoice_number)),
    'cheque_no_voucher', (SELECT count(*) FROM cheques c WHERE c.user_id=v_user AND c.voucher_id IS NULL)
  ) INTO v_drift;

  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb) INTO v_recent_journal FROM (
    SELECT id, transaction_date, transaction_type, debit_account_code, credit_account_code, amount, reference, description
    FROM transactions
    WHERE user_id=v_user AND is_deleted=false
    ORDER BY created_at DESC LIMIT 10
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb) INTO v_recent_vouchers FROM (
    SELECT
      id,
      COALESCE(ref_number, id::text) AS voucher_number,
      date AS voucher_date,
      type AS voucher_type,
      amount,
      contact_id,
      NULL::text AS contact_name
    FROM vouchers
    WHERE user_id = v_user
    ORDER BY created_at DESC
    LIMIT 10
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb) INTO v_recent_invoices FROM (
    SELECT id, invoice_number, total_amount, paid_amount, remaining_amount, status, payment_status, contact_id
    FROM invoices WHERE user_id=v_user
    ORDER BY created_at DESC LIMIT 10
  ) x;

  RETURN jsonb_build_object(
    'snapshot', jsonb_build_object(
      'cash', v_cash, 'bank', v_bank,
      'accounts_receivable', v_ar, 'accounts_payable', v_ap,
      'customer_prepayments', v_cust_prepay, 'supplier_advances', v_supp_advance
    ),
    'drift', v_drift,
    'recent_journal', v_recent_journal,
    'recent_vouchers', v_recent_vouchers,
    'recent_invoices', v_recent_invoices,
    'generated_at', now()
  );
END $function$;

CREATE OR REPLACE FUNCTION public.get_sub_account_balances(p_owner uuid, p_parents text[])
 RETURNS TABLE(account_code text, balance numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH child_accounts AS (
    SELECT a.account_code
    FROM public.accounts a
    WHERE a.user_id = p_owner
      AND a.parent_code = ANY(p_parents)
  ),
  movements AS (
    SELECT t.debit_account_code AS code, t.amount AS d, 0::numeric AS c
    FROM public.transactions t
    WHERE t.user_id = p_owner
      AND t.is_deleted = false
      AND t.debit_account_code IN (SELECT account_code FROM child_accounts)
    UNION ALL
    SELECT t.credit_account_code AS code, 0::numeric AS d, t.amount AS c
    FROM public.transactions t
    WHERE t.user_id = p_owner
      AND t.is_deleted = false
      AND t.credit_account_code IN (SELECT account_code FROM child_accounts)
  )
  SELECT c.account_code,
         COALESCE(SUM(m.d - m.c), 0) AS balance
  FROM child_accounts c
  LEFT JOIN movements m ON m.code = c.account_code
  GROUP BY c.account_code;
$function$;
