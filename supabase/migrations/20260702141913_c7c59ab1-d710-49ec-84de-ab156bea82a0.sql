
CREATE OR REPLACE FUNCTION public.get_pos_shift_summary(
  p_user_id       uuid,
  p_cash_box_gl   text,
  p_from_date     date,
  p_to_date       date
) RETURNS TABLE(
  session_id      uuid,
  business_date   date,
  opened_at       timestamptz,
  closed_at       timestamptz,
  state           text,
  cashier_name    text,
  device_name     text,
  cash_box_id     uuid,
  cash_box_name   text,
  session_seq     int,
  order_count     bigint,
  total_debit     numeric,
  total_credit    numeric,
  total_vat       numeric,
  expected_cash   numeric,
  closing_cash    numeric,
  cash_variance   numeric,
  currency        text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH matched AS (
    SELECT t.amount,
           t.debit_account_code,
           t.credit_account_code,
           t.transaction_type,
           t.reference,
           t.currency,
           o.session_id,
           o.session_seq
      FROM public.transactions t
      JOIN public.pos_orders o
        ON o.order_number = t.reference
       AND o.user_id      = t.user_id
     WHERE t.user_id = p_user_id
       AND (t.debit_account_code = p_cash_box_gl
            OR t.credit_account_code = p_cash_box_gl)
       AND t.transaction_type IN ('pos_sale','pos_sale_vat','pos_refund')
       AND COALESCE(t.is_deleted,false) = false
       AND t.transaction_date BETWEEN p_from_date AND p_to_date
  ),
  per_session AS (
    SELECT m.session_id,
           SUM(CASE WHEN m.debit_account_code  = p_cash_box_gl THEN m.amount ELSE 0 END) AS total_debit,
           SUM(CASE WHEN m.credit_account_code = p_cash_box_gl THEN m.amount ELSE 0 END) AS total_credit,
           SUM(CASE WHEN m.transaction_type    = 'pos_sale_vat' THEN m.amount ELSE 0 END) AS total_vat,
           COUNT(DISTINCT m.reference) AS order_count,
           MIN(m.currency) AS currency,
           MIN(m.session_seq) AS min_seq
      FROM matched m
     WHERE m.session_id IS NOT NULL
     GROUP BY m.session_id
  )
  SELECT ps.session_id,
         CASE WHEN EXTRACT(HOUR FROM (s.opened_at AT TIME ZONE 'Asia/Jerusalem')) < 6
              THEN ((s.opened_at AT TIME ZONE 'Asia/Jerusalem')::date - 1)
              ELSE  (s.opened_at AT TIME ZONE 'Asia/Jerusalem')::date
         END AS business_date,
         s.opened_at,
         s.closed_at,
         s.state,
         s.cashier_name,
         d.device_name,
         s.cash_box_id,
         cb.name AS cash_box_name,
         ps.min_seq AS session_seq,
         ps.order_count,
         ps.total_debit,
         ps.total_credit,
         ps.total_vat,
         s.expected_cash,
         s.closing_cash,
         s.cash_variance,
         COALESCE(ps.currency, cb.currency, 'ILS') AS currency
    FROM per_session ps
    JOIN public.pos_sessions s   ON s.id = ps.session_id
    LEFT JOIN public.pos_devices d ON d.id = s.device_id
    LEFT JOIN public.cash_boxes  cb ON cb.id = s.cash_box_id
   WHERE s.user_id = p_user_id
   ORDER BY s.opened_at ASC, ps.min_seq ASC NULLS LAST
$$;

GRANT EXECUTE ON FUNCTION public.get_pos_shift_summary(uuid,text,date,date) TO authenticated, service_role;
