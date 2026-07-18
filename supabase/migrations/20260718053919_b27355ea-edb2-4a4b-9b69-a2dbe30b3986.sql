-- Fix #1: extend close_pos_session_atomic to write expected_cash/cash_variance/totals atomically
CREATE OR REPLACE FUNCTION public.close_pos_session_atomic(
  p_session_id uuid,
  p_closing_cash numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_expected_cash numeric DEFAULT NULL,
  p_cash_variance numeric DEFAULT NULL,
  p_total_sales numeric DEFAULT NULL,
  p_total_orders int DEFAULT NULL
)
RETURNS TABLE(id uuid, state text, closed_at timestamp with time zone, already_closed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row pos_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM pos_sessions WHERE pos_sessions.id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SHIFT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.state <> 'open' THEN
    RETURN QUERY SELECT v_row.id, v_row.state, v_row.closed_at, true;
    RETURN;
  END IF;

  UPDATE public.pos_sessions AS s
     SET state         = 'closed',
         closed_at     = now(),
         closing_cash  = COALESCE(p_closing_cash,  s.closing_cash),
         notes         = COALESCE(p_notes,         s.notes),
         expected_cash = COALESCE(p_expected_cash, s.expected_cash),
         cash_variance = COALESCE(p_cash_variance, s.cash_variance),
         total_sales   = COALESCE(p_total_sales,   s.total_sales),
         total_orders  = COALESCE(p_total_orders,  s.total_orders),
         updated_at    = now()
   WHERE s.id = p_session_id
     AND s.state = 'open'
  RETURNING * INTO v_row;

  RETURN QUERY SELECT v_row.id, v_row.state, v_row.closed_at, false;
END;
$function$;

-- Fix #2: unified "effective state" view for POS orders
-- effective_state: 'cancelled' | 'voided' (paid but accounting tx soft-deleted) | 'active' (paid, live) | other (draft, etc.)
CREATE OR REPLACE VIEW public.pos_orders_effective
WITH (security_invoker = true)
AS
SELECT
  o.*,
  CASE
    WHEN o.state = 'cancelled' THEN 'cancelled'
    WHEN o.state = 'paid' AND EXISTS (
      SELECT 1
      FROM public.transactions t
      WHERE t.id = ANY (ARRAY[o.transaction_id, o.linked_transaction_id])
        AND t.is_deleted = true
    ) THEN 'voided'
    WHEN o.state = 'paid' THEN 'active'
    ELSE o.state
  END AS effective_state
FROM public.pos_orders o;

GRANT SELECT ON public.pos_orders_effective TO authenticated;
GRANT SELECT ON public.pos_orders_effective TO service_role;