CREATE OR REPLACE FUNCTION public.get_cash_box_balance(p_box_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(cb.opening_balance, 0)
    -- Cash transfers
    + COALESCE((SELECT SUM(ct.amount) FROM public.cash_transfers ct WHERE ct.to_box_id = p_box_id), 0)
    - COALESCE((SELECT SUM(ct.amount) FROM public.cash_transfers ct WHERE ct.from_box_id = p_box_id), 0)
    -- Journal entries posted to this box's GL account (POS sales, vouchers, manual entries…)
    + COALESCE((
        SELECT SUM(t.amount) FROM public.transactions t
        WHERE t.user_id = cb.user_id
          AND t.is_deleted = false
          AND t.debit_account_code = cb.gl_account_code
          AND cb.gl_account_code IS NOT NULL
      ), 0)
    - COALESCE((
        SELECT SUM(t.amount) FROM public.transactions t
        WHERE t.user_id = cb.user_id
          AND t.is_deleted = false
          AND t.credit_account_code = cb.gl_account_code
          AND cb.gl_account_code IS NOT NULL
      ), 0)
  FROM public.cash_boxes cb WHERE cb.id = p_box_id;
$function$;