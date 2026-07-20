
CREATE OR REPLACE FUNCTION public.close_pos_session_atomic(
  p_session_id uuid,
  p_closing_cash numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_expected_cash numeric DEFAULT NULL,
  p_cash_variance numeric DEFAULT NULL,
  p_total_sales numeric DEFAULT NULL,
  p_total_orders integer DEFAULT NULL
)
RETURNS TABLE(id uuid, state text, closed_at timestamp with time zone, already_closed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row       pos_sessions%ROWTYPE;
  v_snap_err  text;
BEGIN
  -- 1) Lock the session row to prevent concurrent edits during snapshot
  SELECT * INTO v_row FROM pos_sessions WHERE pos_sessions.id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SHIFT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.state <> 'open' THEN
    RETURN QUERY SELECT v_row.id, v_row.state, v_row.closed_at, true;
    RETURN;
  END IF;

  -- 2) Perform the exact same close as before (backward compatible)
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

  -- 3) Write persistent snapshot (non-blocking: never fail the close)
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.pos_shift_close_snapshots WHERE session_id = v_row.id) THEN
      INSERT INTO public.pos_shift_close_snapshots (
        session_id, company_id, branch_id, cashier_pos_user_id, cashier_name,
        closed_at, closed_by_auth_user_id, business_date, shift_code,
        total_sales, total_returns, total_orders,
        opening_cash, closing_cash, expected_cash, cash_variance,
        cash_ils, visa_ils, credit_ils, other_ils,
        fx_breakdown,
        cash_transfers_total, expenses_total,
        raw_payments, raw_orders, raw_cash_transfers, raw_expenses,
        source, version
      )
      SELECT
        v_row.id,
        v_row.company_id,
        v_row.branch_id,
        v_row.cashier_pos_user_id,
        v_row.cashier_name,
        v_row.closed_at,
        auth.uid(),
        v_row.business_date,
        v_row.shift_code,
        -- Effective sales/returns/orders from DB
        COALESCE(agg.sales_active, 0),
        COALESCE(agg.returns_active, 0),
        COALESCE(agg.orders_active, 0),
        COALESCE(v_row.opening_cash, 0),
        COALESCE(v_row.closing_cash, 0),
        COALESCE(v_row.expected_cash, 0),
        COALESCE(v_row.cash_variance, 0),
        -- Payment breakdowns in ILS (fallback exchange_rate=1 when null/ILS)
        COALESCE(pay.cash_ils, 0),
        COALESCE(pay.visa_ils, 0),
        COALESCE(pay.credit_ils, 0),
        COALESCE(pay.other_ils, 0),
        COALESCE(fx.fx_breakdown, '[]'::jsonb),
        COALESCE(ctf.total, 0),
        COALESCE(exp.total, 0),
        COALESCE(rawp.data, '[]'::jsonb),
        COALESCE(rawo.data, '[]'::jsonb),
        COALESCE(rawc.data, '[]'::jsonb),
        COALESCE(rawe.data, '[]'::jsonb),
        'closure',
        1
      FROM (SELECT 1) x
      LEFT JOIN LATERAL (
        SELECT
          SUM(CASE WHEN effective_state = 'active' AND COALESCE(is_return,false)=false THEN total ELSE 0 END) AS sales_active,
          SUM(CASE WHEN effective_state = 'active' AND is_return=true THEN total ELSE 0 END) AS returns_active,
          COUNT(*) FILTER (WHERE effective_state = 'active') AS orders_active
        FROM public.pos_orders_effective
        WHERE session_id = v_row.id
      ) agg ON true
      LEFT JOIN LATERAL (
        SELECT
          SUM(CASE WHEN LOWER(p.payment_method) IN ('cash','نقدي','نقد')
                   THEN p.amount * COALESCE(NULLIF(p.exchange_rate,0), 1) END) AS cash_ils,
          SUM(CASE WHEN LOWER(p.payment_method) IN ('visa','card','بطاقة','فيزا','credit_card')
                   THEN p.amount * COALESCE(NULLIF(p.exchange_rate,0), 1) END) AS visa_ils,
          SUM(CASE WHEN LOWER(p.payment_method) IN ('credit','deferred','آجل','اجل')
                   THEN p.amount * COALESCE(NULLIF(p.exchange_rate,0), 1) END) AS credit_ils,
          SUM(CASE WHEN LOWER(p.payment_method) NOT IN
                     ('cash','نقدي','نقد','visa','card','بطاقة','فيزا','credit_card','credit','deferred','آجل','اجل')
                   THEN p.amount * COALESCE(NULLIF(p.exchange_rate,0), 1) END) AS other_ils
        FROM public.pos_payments p
        JOIN public.pos_orders o ON o.id = p.order_id
        WHERE o.session_id = v_row.id
          AND COALESCE(p.is_refund, false) = false
          AND o.state <> 'cancelled'
      ) pay ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'currency', COALESCE(p.currency, 'ILS'),
          'amount_original', SUM(p.amount),
          'exchange_rate_avg', AVG(COALESCE(NULLIF(p.exchange_rate,0), 1)),
          'amount_ils', SUM(p.amount * COALESCE(NULLIF(p.exchange_rate,0), 1)),
          'count', COUNT(*)
        )) AS fx_breakdown
        FROM (
          SELECT p.currency, p.amount, p.exchange_rate
          FROM public.pos_payments p
          JOIN public.pos_orders o ON o.id = p.order_id
          WHERE o.session_id = v_row.id
            AND COALESCE(p.is_refund, false) = false
            AND o.state <> 'cancelled'
            AND UPPER(COALESCE(p.currency, 'ILS')) <> 'ILS'
        ) p
        GROUP BY p.currency
      ) fx ON true
      LEFT JOIN LATERAL (
        SELECT SUM(COALESCE(ct.amount_ils, ct.amount)) AS total
        FROM public.cash_transfers ct
        WHERE ct.pos_session_id = v_row.id
      ) ctf ON true
      LEFT JOIN LATERAL (
        SELECT SUM(e.amount) AS total
        FROM public.pos_expenses e
        WHERE e.shift_id = v_row.id
      ) exp ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(to_jsonb(p) - 'client_ip' - 'client_user_agent') AS data
        FROM public.pos_payments p
        JOIN public.pos_orders o ON o.id = p.order_id
        WHERE o.session_id = v_row.id
      ) rawp ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'id', o.id, 'order_number', o.order_number, 'state', o.state,
          'effective_state', o.effective_state, 'total', o.total,
          'is_return', o.is_return, 'cancelled_at', o.cancelled_at,
          'transaction_id', o.transaction_id, 'linked_transaction_id', o.linked_transaction_id,
          'created_at', o.created_at, 'paid_at', o.paid_at
        )) AS data
        FROM public.pos_orders_effective o
        WHERE o.session_id = v_row.id
      ) rawo ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(to_jsonb(ct)) AS data
        FROM public.cash_transfers ct
        WHERE ct.pos_session_id = v_row.id
      ) rawc ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(to_jsonb(e)) AS data
        FROM public.pos_expenses e
        WHERE e.shift_id = v_row.id
      ) rawe ON true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Never block a close because of snapshot failure; log to notes only
    GET STACKED DIAGNOSTICS v_snap_err = MESSAGE_TEXT;
    BEGIN
      INSERT INTO public.pos_shift_post_close_edits (
        session_id, entity_table, entity_id, action, before_data, after_data, reason
      ) VALUES (
        v_row.id, 'pos_shift_close_snapshots', v_row.id, 'insert',
        NULL, NULL, 'snapshot_failed: ' || COALESCE(v_snap_err, 'unknown')
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END;

  RETURN QUERY SELECT v_row.id, v_row.state, v_row.closed_at, false;
END;
$function$;
