
-- =====================================================================
-- Unified POS Shift Reconciliation — single source of truth
-- Phase A: create SECURITY DEFINER read-only functions. No UI changes.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_pos_shift_reconciliation(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session       public.pos_sessions%ROWTYPE;
  v_caller        uuid := auth.uid();
  v_result        jsonb;
  v_orders        jsonb;
  v_payments      jsonb;
  v_visa          jsonb;
  v_cash_curr     jsonb;
  v_expected      jsonb;
  v_orphans       jsonb;
  v_meta          jsonb;
BEGIN
  -- ------------------------------------------------------------------
  -- 1) Fetch session + tenant guard
  -- ------------------------------------------------------------------
  SELECT * INTO v_session
    FROM public.pos_sessions
   WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session % not found', p_session_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Only the session owner (tenant) OR service_role may read.
  IF v_caller IS NOT NULL AND v_caller <> v_session.user_id THEN
    RAISE EXCEPTION 'Access denied for session %', p_session_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ------------------------------------------------------------------
  -- 2) Session meta (branch / cash box / device / cashier / shift code)
  -- ------------------------------------------------------------------
  SELECT jsonb_build_object(
           'session_id',        v_session.id,
           'user_id',           v_session.user_id,
           'company_id',        v_session.company_id,
           'state',             v_session.state,
           'opened_at',         v_session.opened_at,
           'closed_at',         v_session.closed_at,
           'business_date',     v_session.business_date,
           'shift_seq',         v_session.shift_seq,
           'shift_code',        v_session.shift_code,
           'cashier_name',      v_session.cashier_name,
           'opening_cash',      COALESCE(v_session.opening_cash, 0),
           'closing_cash',      v_session.closing_cash,
           'stored_expected',   v_session.expected_cash,
           'stored_variance',   v_session.cash_variance,
           'stored_total_sales',v_session.total_sales,
           'stored_total_orders',v_session.total_orders,
           'branch',            (SELECT to_jsonb(b) FROM (
                                    SELECT br.id, br.name, br.code
                                      FROM public.branches br
                                     WHERE br.id = v_session.branch_id
                                  ) b),
           'cash_box',          (SELECT to_jsonb(cb) FROM (
                                    SELECT c.id, c.name, c.gl_account_code, c.currency
                                      FROM public.cash_boxes c
                                     WHERE c.id = v_session.cash_box_id
                                  ) cb),
           'device',            (SELECT to_jsonb(d) FROM (
                                    SELECT dv.id, dv.device_name
                                      FROM public.pos_devices dv
                                     WHERE dv.id = v_session.device_id
                                  ) d),
           'terminal',          (SELECT to_jsonb(t) FROM (
                                    SELECT tr.id, tr.terminal_code, tr.terminal_name
                                      FROM public.pos_terminals tr
                                     WHERE tr.id = v_session.terminal_id
                                  ) t)
         )
    INTO v_meta;

  -- ------------------------------------------------------------------
  -- 3) Order counts using pos_orders_effective (single source of truth)
  --    "active" = effectively counted revenue; "voided" = paid but GL
  --    reversed; "cancelled" = never counted.
  -- ------------------------------------------------------------------
  WITH o AS (
    SELECT effective_state,
           COALESCE(is_return, false) AS is_return,
           COALESCE(total, 0)         AS total,
           COALESCE(subtotal, 0)      AS subtotal,
           COALESCE(discount_amount,0) AS discount_amount,
           COALESCE(tax_amount, 0)    AS tax_amount
      FROM public.pos_orders_effective
     WHERE session_id = p_session_id
  )
  SELECT jsonb_build_object(
           'active_count',       COUNT(*) FILTER (WHERE effective_state = 'active' AND NOT is_return),
           'return_count',       COUNT(*) FILTER (WHERE effective_state = 'active' AND is_return),
           'voided_count',       COUNT(*) FILTER (WHERE effective_state = 'voided'),
           'cancelled_count',    COUNT(*) FILTER (WHERE effective_state = 'cancelled'),
           'active_sales_total', COALESCE(SUM(total)         FILTER (WHERE effective_state = 'active' AND NOT is_return), 0),
           'active_returns_total', COALESCE(SUM(total)       FILTER (WHERE effective_state = 'active' AND is_return),     0),
           'active_subtotal',    COALESCE(SUM(subtotal)      FILTER (WHERE effective_state = 'active' AND NOT is_return), 0),
           'active_discount',    COALESCE(SUM(discount_amount) FILTER (WHERE effective_state = 'active' AND NOT is_return), 0),
           'active_tax',         COALESCE(SUM(tax_amount)    FILTER (WHERE effective_state = 'active' AND NOT is_return), 0),
           'voided_total_excluded',    COALESCE(SUM(total)   FILTER (WHERE effective_state = 'voided'),    0),
           'cancelled_total_excluded', COALESCE(SUM(total)   FILTER (WHERE effective_state = 'cancelled'), 0)
         )
    INTO v_orders
    FROM o;

  -- ------------------------------------------------------------------
  -- 4) Payment method totals — ONLY payments belonging to active orders.
  --    Refund payments (is_refund) are separated so they never inflate
  --    the "collected" columns.
  -- ------------------------------------------------------------------
  WITH pay AS (
    SELECT p.payment_method,
           p.currency,
           COALESCE(p.amount, 0)         AS amount,
           COALESCE(p.tendered, 0)       AS tendered,
           COALESCE(p.change_amount, 0)  AS change_amount,
           p.change_currency,
           COALESCE(p.exchange_rate, 0)  AS exchange_rate,
           COALESCE(p.is_refund, false)  AS is_refund,
           p.card_reference,
           oe.effective_state,
           COALESCE(oe.is_return, false) AS is_return
      FROM public.pos_payments p
      JOIN public.pos_orders_effective oe ON oe.id = p.order_id
     WHERE oe.session_id = p_session_id
  )
  SELECT jsonb_object_agg(payment_method, breakdown)
    INTO v_payments
    FROM (
      SELECT COALESCE(payment_method, 'cash') AS payment_method,
             jsonb_build_object(
               'sales_amount',   COALESCE(SUM(amount) FILTER (WHERE effective_state='active' AND NOT is_refund AND NOT is_return), 0),
               'sales_count',    COUNT(*)             FILTER (WHERE effective_state='active' AND NOT is_refund AND NOT is_return),
               'refund_amount',  COALESCE(SUM(amount) FILTER (WHERE effective_state='active' AND (is_refund OR is_return)), 0),
               'refund_count',   COUNT(*)             FILTER (WHERE effective_state='active' AND (is_refund OR is_return)),
               'net_amount',     COALESCE(SUM(CASE WHEN is_refund OR is_return THEN -amount ELSE amount END)
                                            FILTER (WHERE effective_state='active'), 0),
               'excluded_voided_amount',    COALESCE(SUM(amount) FILTER (WHERE effective_state='voided'), 0),
               'excluded_cancelled_amount', COALESCE(SUM(amount) FILTER (WHERE effective_state='cancelled'), 0)
             ) AS breakdown
        FROM pay
       GROUP BY COALESCE(payment_method, 'cash')
    ) s;

  -- ------------------------------------------------------------------
  -- 5) VISA / card breakdown by card_reference (active sales only)
  -- ------------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(row_to_json(v) ORDER BY v.amount DESC), '[]'::jsonb)
    INTO v_visa
    FROM (
      SELECT COALESCE(p.card_reference, '(no-ref)') AS card_reference,
             COUNT(*)                               AS count,
             SUM(COALESCE(p.amount, 0))             AS amount
        FROM public.pos_payments p
        JOIN public.pos_orders_effective oe ON oe.id = p.order_id
       WHERE oe.session_id = p_session_id
         AND oe.effective_state = 'active'
         AND COALESCE(p.is_refund, false) = false
         AND COALESCE(oe.is_return, false) = false
         AND p.payment_method IN ('visa','card','credit_card','mastercard')
       GROUP BY COALESCE(p.card_reference, '(no-ref)')
    ) v;

  -- ------------------------------------------------------------------
  -- 6) Per-currency cash reconciliation — mirrors shift-close-math.ts
  --    exactly: ILS keeps additive sales & foreign-change deduction;
  --    foreign currencies compute tendered = tenderedILS / rate.
  -- ------------------------------------------------------------------
  WITH cash_pay AS (
    SELECT p.currency,
           p.change_currency,
           COALESCE(p.amount, 0)        AS amount,        -- ILS
           COALESCE(p.tendered, 0)      AS tendered_ils,  -- ILS
           COALESCE(p.change_amount, 0) AS change_amount,
           COALESCE(p.exchange_rate, 0) AS exchange_rate
      FROM public.pos_payments p
      JOIN public.pos_orders_effective oe ON oe.id = p.order_id
     WHERE oe.session_id = p_session_id
       AND oe.effective_state = 'active'
       AND COALESCE(p.is_refund, false) = false
       AND COALESCE(oe.is_return, false) = false
       AND COALESCE(p.payment_method, 'cash') = 'cash'
  ),
  cash_refunds AS (
    -- Refund side of active orders + cash returns via is_return orders
    SELECT COALESCE(p.currency, 'ILS')  AS currency,
           COALESCE(p.amount, 0)         AS amount
      FROM public.pos_payments p
      JOIN public.pos_orders_effective oe ON oe.id = p.order_id
     WHERE oe.session_id = p_session_id
       AND oe.effective_state = 'active'
       AND COALESCE(p.payment_method, 'cash') = 'cash'
       AND (COALESCE(p.is_refund, false) OR COALESCE(oe.is_return, false))
  ),
  expenses AS (
    SELECT COALESCE(SUM(COALESCE(amount, 0)), 0) AS ils
      FROM public.pos_expenses
     WHERE shift_id = p_session_id
       AND COALESCE(payment_method, 'cash') = 'cash'
  ),
  purchases AS (
    SELECT COALESCE(SUM(COALESCE(total_amount, 0)), 0) AS ils
      FROM public.pos_purchases
     WHERE shift_id = p_session_id
       AND COALESCE(payment_type, 'cash') = 'cash'
  ),
  fx_adj AS (
    SELECT currency,
           COALESCE(SUM(COALESCE(foreign_amount, 0)), 0) AS foreign_amount,
           COALESCE(SUM(COALESCE(ils_equivalent, 0)), 0) AS ils_equivalent
      FROM public.pos_shift_foreign_adjustments
     WHERE session_id = p_session_id
     GROUP BY currency
  ),
  ils_side AS (
    SELECT COALESCE(SUM(amount) FILTER (WHERE COALESCE(currency,'ILS') = 'ILS'), 0)                                      AS ils_cash_sales,
           COALESCE(SUM(change_amount) FILTER (WHERE COALESCE(change_currency,'ILS') = 'ILS' AND change_amount > 0), 0)   AS ils_change_given
      FROM cash_pay
  ),
  fx_side AS (
    SELECT COALESCE(currency, 'USD') AS currency,
           SUM(CASE WHEN exchange_rate > 0 THEN tendered_ils / exchange_rate ELSE 0 END) AS tendered_foreign
      FROM cash_pay
     WHERE COALESCE(currency, 'ILS') <> 'ILS'
     GROUP BY COALESCE(currency, 'USD')
  ),
  fx_change AS (
    SELECT COALESCE(change_currency, 'ILS') AS currency,
           SUM(change_amount) AS change_amount
      FROM cash_pay
     WHERE COALESCE(change_currency, 'ILS') <> 'ILS'
       AND change_amount > 0
     GROUP BY COALESCE(change_currency, 'ILS')
  ),
  refunds_by_curr AS (
    SELECT currency, SUM(amount) AS amount
      FROM cash_refunds
     GROUP BY currency
  ),
  currencies_seen AS (
    SELECT 'ILS'::text AS cur
    UNION SELECT currency FROM fx_side
    UNION SELECT currency FROM fx_change
    UNION SELECT currency FROM refunds_by_curr
    UNION SELECT currency FROM fx_adj
  )
  SELECT jsonb_object_agg(cur, block)
    INTO v_cash_curr
    FROM (
      SELECT c.cur,
             jsonb_build_object(
               'cash_sales',        CASE WHEN c.cur = 'ILS' THEN (SELECT ils_cash_sales FROM ils_side) ELSE 0 END,
               'foreign_tendered',  CASE WHEN c.cur = 'ILS' THEN 0 ELSE COALESCE((SELECT tendered_foreign FROM fx_side WHERE currency = c.cur), 0) END,
               'change_given',      CASE WHEN c.cur = 'ILS' THEN (SELECT ils_change_given FROM ils_side)
                                         ELSE COALESCE((SELECT change_amount FROM fx_change WHERE currency = c.cur), 0) END,
               'cash_returns',      COALESCE((SELECT amount FROM refunds_by_curr WHERE currency = c.cur), 0),
               'cash_expenses',     CASE WHEN c.cur = 'ILS' THEN (SELECT ils FROM expenses) ELSE 0 END,
               'cash_purchases',    CASE WHEN c.cur = 'ILS' THEN (SELECT ils FROM purchases) ELSE 0 END,
               'fx_adjustment_foreign', COALESCE((SELECT foreign_amount FROM fx_adj WHERE currency = c.cur), 0),
               'fx_adjustment_ils',     COALESCE((SELECT ils_equivalent FROM fx_adj WHERE currency = c.cur), 0)
             ) AS block
        FROM currencies_seen c
    ) x;

  -- ------------------------------------------------------------------
  -- 7) Expected cash per currency (mirrors shift-close-math.ts).
  -- ------------------------------------------------------------------
  SELECT jsonb_object_agg(cur,
           jsonb_build_object(
             'expected', expected,
             'actual',   NULL,       -- filled by UI from cash count when available
             'variance', NULL
           ))
    INTO v_expected
    FROM (
      SELECT k.key AS cur,
             CASE
               WHEN k.key = 'ILS' THEN
                 COALESCE(v_session.opening_cash, 0)
                 + COALESCE((v_cash_curr -> 'ILS' ->> 'cash_sales')::numeric, 0)
                 - COALESCE((v_cash_curr -> 'ILS' ->> 'change_given')::numeric, 0)
                 - COALESCE((v_cash_curr -> 'ILS' ->> 'cash_expenses')::numeric, 0)
                 - COALESCE((v_cash_curr -> 'ILS' ->> 'cash_purchases')::numeric, 0)
                 - COALESCE((v_cash_curr -> 'ILS' ->> 'cash_returns')::numeric, 0)
                 + COALESCE((v_cash_curr -> 'ILS' ->> 'fx_adjustment_foreign')::numeric, 0)
               ELSE
                 COALESCE((v_cash_curr -> k.key ->> 'foreign_tendered')::numeric, 0)
                 - COALESCE((v_cash_curr -> k.key ->> 'change_given')::numeric, 0)
                 - COALESCE((v_cash_curr -> k.key ->> 'cash_returns')::numeric, 0)
                 + COALESCE((v_cash_curr -> k.key ->> 'fx_adjustment_foreign')::numeric, 0)
             END AS expected
        FROM jsonb_object_keys(COALESCE(v_cash_curr, '{}'::jsonb)) k(key)
    ) e;

  -- ------------------------------------------------------------------
  -- 8) Warnings: orphan payments attached to voided/cancelled orders.
  -- ------------------------------------------------------------------
  SELECT jsonb_build_object(
           'voided_payments_amount',    COALESCE(SUM(COALESCE(p.amount, 0)) FILTER (WHERE oe.effective_state = 'voided'), 0),
           'voided_payments_count',     COUNT(*)                            FILTER (WHERE oe.effective_state = 'voided'),
           'cancelled_payments_amount', COALESCE(SUM(COALESCE(p.amount, 0)) FILTER (WHERE oe.effective_state = 'cancelled'), 0),
           'cancelled_payments_count',  COUNT(*)                            FILTER (WHERE oe.effective_state = 'cancelled'),
           'visa_missing_ref_count',    COUNT(*) FILTER (WHERE oe.effective_state = 'active'
                                                            AND p.payment_method IN ('visa','card','credit_card','mastercard')
                                                            AND COALESCE(p.is_refund,false) = false
                                                            AND (p.card_reference IS NULL OR btrim(p.card_reference) = ''))
         )
    INTO v_orphans
    FROM public.pos_payments p
    JOIN public.pos_orders_effective oe ON oe.id = p.order_id
   WHERE oe.session_id = p_session_id;

  -- ------------------------------------------------------------------
  -- 9) Assemble
  -- ------------------------------------------------------------------
  v_result := jsonb_build_object(
    'version',    1,
    'generated_at', now(),
    'session',    v_meta,
    'orders',     COALESCE(v_orders,   '{}'::jsonb),
    'payments',   COALESCE(v_payments, '{}'::jsonb),
    'visa_breakdown', COALESCE(v_visa, '[]'::jsonb),
    'cash_by_currency', COALESCE(v_cash_curr, '{}'::jsonb),
    'expected_cash',    COALESCE(v_expected,  '{}'::jsonb),
    'warnings',   COALESCE(v_orphans,  '{}'::jsonb)
  );

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_pos_shift_reconciliation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pos_shift_reconciliation(uuid) TO authenticated, service_role;

-- =====================================================================
-- Range companion: reconciliation for many sessions between two dates.
-- Uses business_date on pos_sessions (set by shift-code trigger) and
-- falls back to opened_at when business_date is null (legacy shifts).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_pos_shift_reconciliation_range(
  p_from date,
  p_to   date
)
RETURNS TABLE(session_id uuid, business_date date, reconciliation jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT s.id,
         COALESCE(s.business_date,
                  CASE WHEN EXTRACT(HOUR FROM (s.opened_at AT TIME ZONE 'Asia/Jerusalem')) < 6
                       THEN ((s.opened_at AT TIME ZONE 'Asia/Jerusalem')::date - 1)
                       ELSE  (s.opened_at AT TIME ZONE 'Asia/Jerusalem')::date
                  END) AS business_date,
         public.get_pos_shift_reconciliation(s.id) AS reconciliation
    FROM public.pos_sessions s
   WHERE s.user_id = v_caller
     AND COALESCE(s.is_deleted, false) = false
     AND COALESCE(s.business_date,
                  CASE WHEN EXTRACT(HOUR FROM (s.opened_at AT TIME ZONE 'Asia/Jerusalem')) < 6
                       THEN ((s.opened_at AT TIME ZONE 'Asia/Jerusalem')::date - 1)
                       ELSE  (s.opened_at AT TIME ZONE 'Asia/Jerusalem')::date
                  END) BETWEEN p_from AND p_to
   ORDER BY s.opened_at ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_pos_shift_reconciliation_range(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pos_shift_reconciliation_range(date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_pos_shift_reconciliation(uuid) IS
  'Unified POS shift reconciliation. Single source of truth for shift close, audit and reports. Reads pos_orders_effective + pos_payments + pos_expenses + pos_purchases + pos_shift_foreign_adjustments. Read-only, SECURITY DEFINER, tenant-guarded.';

COMMENT ON FUNCTION public.get_pos_shift_reconciliation_range(date, date) IS
  'Range wrapper over get_pos_shift_reconciliation for reports (per-owner via auth.uid()).';
