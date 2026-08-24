CREATE OR REPLACE FUNCTION public.get_accounting_center_kpi_breakdown(_prefix text, _natural text DEFAULT 'debit'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_accounts jsonb;
  v_recent jsonb;
  v_total numeric := 0;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error','unauthenticated');
  END IF;

  WITH tx AS (
    SELECT debit_account_code AS code, amount AS dr, 0::numeric AS cr
    FROM transactions
    WHERE user_id = v_user AND is_deleted = false
    UNION ALL
    SELECT credit_account_code AS code, 0::numeric AS dr, amount AS cr
    FROM transactions
    WHERE user_id = v_user AND is_deleted = false
  ),
  -- Hybrid contacts (عميل ومورد) keep ONE sub-account (may live under 113x or 211x).
  -- Classify that account by balance SIGN: net debit => receivable (belongs to 113 card),
  -- net credit => payable (belongs to 211 card).
  hybrid_bal AS (
    SELECT a.account_code AS code, COALESCE(SUM(tx.dr - tx.cr), 0) AS net_debit
    FROM accounts a
    JOIN contacts c ON c.user_id = a.user_id
                   AND (c.linked_account_code = a.account_code OR c.id = a.contact_id)
    LEFT JOIN tx ON tx.code = a.account_code
    WHERE a.user_id = v_user
      AND (a.account_code LIKE '113%' OR a.account_code LIKE '211%')
      AND c.contact_type IN ('عميل ومورد','customer_supplier')
    GROUP BY a.account_code
  ),
  hybrid_ar AS (SELECT code FROM hybrid_bal WHERE code LIKE '211%' AND net_debit > 0),
  hybrid_ap AS (SELECT code FROM hybrid_bal WHERE code LIKE '113%' AND net_debit < 0),
  eff_lines AS (
    SELECT tx.code, tx.dr, tx.cr FROM tx
    WHERE tx.code LIKE _prefix
      AND NOT (_prefix = '113%' AND tx.code IN (SELECT code FROM hybrid_ap))
      AND NOT (_prefix = '211%' AND tx.code IN (SELECT code FROM hybrid_ar))
    UNION ALL
    SELECT tx.code, tx.dr, tx.cr FROM tx
    WHERE ((_prefix = '113%' AND tx.code IN (SELECT code FROM hybrid_ar))
        OR (_prefix = '211%' AND tx.code IN (SELECT code FROM hybrid_ap)))
  ),
  agg AS (
    SELECT l.code,
           SUM(l.dr) AS total_debit,
           SUM(l.cr) AS total_credit,
           CASE WHEN _natural = 'credit' THEN SUM(l.cr) - SUM(l.dr) ELSE SUM(l.dr) - SUM(l.cr) END AS balance,
           COUNT(*) AS entries
    FROM eff_lines l
    GROUP BY l.code
  )
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY abs(x.balance) DESC), '[]'::jsonb),
         COALESCE(SUM(x.balance), 0)
  INTO v_accounts, v_total
  FROM (
    SELECT a.code,
           COALESCE(c2.contact_name, acc.account_name, a.code) AS name,
           a.total_debit, a.total_credit, a.balance, a.entries
    FROM agg a
    LEFT JOIN accounts acc ON acc.account_code = a.code AND acc.user_id = v_user
    LEFT JOIN contacts c2 ON c2.user_id = v_user AND c2.linked_account_code = a.code
  ) x;

  WITH hybrid_bal AS (
    SELECT a.account_code AS code, COALESCE(SUM(CASE WHEN t.debit_account_code = a.account_code THEN t.amount ELSE -t.amount END), 0) AS net_debit
    FROM accounts a
    JOIN contacts c ON c.user_id = a.user_id
                   AND (c.linked_account_code = a.account_code OR c.id = a.contact_id)
    LEFT JOIN transactions t ON t.user_id = v_user AND t.is_deleted = false
                            AND (t.debit_account_code = a.account_code OR t.credit_account_code = a.account_code)
    WHERE a.user_id = v_user
      AND (a.account_code LIKE '113%' OR a.account_code LIKE '211%')
      AND c.contact_type IN ('عميل ومورد','customer_supplier')
    GROUP BY a.account_code
  ),
  hybrid_ar AS (SELECT code FROM hybrid_bal WHERE code LIKE '211%' AND net_debit > 0),
  hybrid_ap AS (SELECT code FROM hybrid_bal WHERE code LIKE '113%' AND net_debit < 0)
  SELECT COALESCE(jsonb_agg(row_to_json(y)), '[]'::jsonb) INTO v_recent FROM (
    SELECT t.id, t.transaction_date, t.transaction_type, t.debit_account_code, t.credit_account_code,
           t.amount, t.reference, t.description,
           CASE WHEN (t.debit_account_code LIKE _prefix
                      AND NOT (_prefix = '113%' AND t.debit_account_code IN (SELECT code FROM hybrid_ap))
                      AND NOT (_prefix = '211%' AND t.debit_account_code IN (SELECT code FROM hybrid_ar)))
                  OR (_prefix = '113%' AND t.debit_account_code IN (SELECT code FROM hybrid_ar))
                  OR (_prefix = '211%' AND t.debit_account_code IN (SELECT code FROM hybrid_ap))
                THEN 'debit' ELSE 'credit' END AS side
    FROM transactions t
    WHERE t.user_id = v_user AND t.is_deleted = false
      AND (
        (t.debit_account_code LIKE _prefix OR t.credit_account_code LIKE _prefix)
        OR (_prefix = '113%' AND (t.debit_account_code IN (SELECT code FROM hybrid_ar) OR t.credit_account_code IN (SELECT code FROM hybrid_ar)))
        OR (_prefix = '211%' AND (t.debit_account_code IN (SELECT code FROM hybrid_ap) OR t.credit_account_code IN (SELECT code FROM hybrid_ap)))
      )
      AND NOT (_prefix = '113%' AND (t.debit_account_code IN (SELECT code FROM hybrid_ap) OR t.credit_account_code IN (SELECT code FROM hybrid_ap)))
      AND NOT (_prefix = '211%' AND (t.debit_account_code IN (SELECT code FROM hybrid_ar) OR t.credit_account_code IN (SELECT code FROM hybrid_ar)))
    ORDER BY t.transaction_date DESC, t.created_at DESC
    LIMIT 50
  ) y;

  RETURN jsonb_build_object('prefix', _prefix, 'total', v_total, 'accounts', v_accounts, 'recent', v_recent);
END $function$;

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
  v_hybrid_ar numeric := 0;
  v_hybrid_ap numeric := 0;
  v_drift jsonb;
  v_recent_journal jsonb;
  v_recent_vouchers jsonb;
  v_recent_invoices jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error','unauthenticated');
  END IF;

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

  -- Hybrid contacts (عميل ومورد): single sub-account classified by balance sign.
  -- Net-debit hybrid account under 211x => receivable (moves to AR).
  -- Net-credit hybrid account under 113x => payable (moves to AP).
  SELECT
    COALESCE(SUM(net_debit) FILTER (WHERE code LIKE '211%' AND net_debit > 0), 0),
    COALESCE(SUM(-net_debit) FILTER (WHERE code LIKE '113%' AND net_debit < 0), 0)
  INTO v_hybrid_ar, v_hybrid_ap
  FROM (
    SELECT a.account_code AS code,
           COALESCE(SUM(CASE WHEN t.debit_account_code = a.account_code THEN t.amount ELSE -t.amount END), 0) AS net_debit
    FROM accounts a
    JOIN contacts c ON c.user_id = a.user_id
                   AND (c.linked_account_code = a.account_code OR c.id = a.contact_id)
    LEFT JOIN transactions t ON t.user_id = v_user AND t.is_deleted = false
                            AND (t.debit_account_code = a.account_code OR t.credit_account_code = a.account_code)
    WHERE a.user_id = v_user
      AND (a.account_code LIKE '113%' OR a.account_code LIKE '211%')
      AND c.contact_type IN ('عميل ومورد','customer_supplier')
    GROUP BY a.account_code
  ) hb;

  v_ar := v_ar + v_hybrid_ar - v_hybrid_ap;
  v_ap := v_ap + v_hybrid_ar - v_hybrid_ap;

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