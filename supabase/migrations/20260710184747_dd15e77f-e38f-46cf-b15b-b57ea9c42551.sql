
-- Bulk aggregate: return all active cash-box balances for a user in ONE call
CREATE OR REPLACE FUNCTION public.get_cash_boxes_balances_bulk(p_user_id uuid)
RETURNS TABLE(box_id uuid, balance numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH boxes AS (
    SELECT id, COALESCE(opening_balance, 0) AS opening_balance, gl_account_code
    FROM public.cash_boxes
    WHERE user_id = p_user_id AND is_active = true
  ),
  codes AS (
    SELECT DISTINCT gl_account_code FROM boxes WHERE gl_account_code IS NOT NULL
  ),
  tin AS (
    SELECT to_box_id AS bid, SUM(amount) AS amt
    FROM public.cash_transfers
    WHERE to_box_id IN (SELECT id FROM boxes)
    GROUP BY to_box_id
  ),
  tout AS (
    SELECT from_box_id AS bid, SUM(amount) AS amt
    FROM public.cash_transfers
    WHERE from_box_id IN (SELECT id FROM boxes)
    GROUP BY from_box_id
  ),
  tx_dr AS (
    SELECT debit_account_code AS code, SUM(amount) AS amt
    FROM public.transactions
    WHERE user_id = p_user_id
      AND is_deleted = false
      AND debit_account_code IN (SELECT gl_account_code FROM codes)
    GROUP BY debit_account_code
  ),
  tx_cr AS (
    SELECT credit_account_code AS code, SUM(amount) AS amt
    FROM public.transactions
    WHERE user_id = p_user_id
      AND is_deleted = false
      AND credit_account_code IN (SELECT gl_account_code FROM codes)
    GROUP BY credit_account_code
  )
  SELECT b.id,
    b.opening_balance
    + COALESCE((SELECT amt FROM tin  WHERE bid = b.id), 0)
    - COALESCE((SELECT amt FROM tout WHERE bid = b.id), 0)
    + COALESCE((SELECT amt FROM tx_dr WHERE code = b.gl_account_code), 0)
    - COALESCE((SELECT amt FROM tx_cr WHERE code = b.gl_account_code), 0)
  FROM boxes b;
$$;

GRANT EXECUTE ON FUNCTION public.get_cash_boxes_balances_bulk(uuid) TO authenticated, service_role;

-- Compound index for the dashboard's hot POS query
CREATE INDEX IF NOT EXISTS idx_pos_orders_user_state_business_date
  ON public.pos_orders (user_id, state, business_date DESC);
