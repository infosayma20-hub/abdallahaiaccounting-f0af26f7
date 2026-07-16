CREATE OR REPLACE FUNCTION public.get_owner_sales_fast(p_user_id uuid, p_from date, p_to date, p_with_details boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH paid_orders AS MATERIALIZED (
  SELECT
    o.id, o.total, o.session_id, o.created_at, o.transaction_id, o.business_date,
    COALESCE(o.meal_subsidy_amount, 0)::numeric AS meal_subsidy_amount,
    COALESCE(o.delivery_fee, 0)::numeric AS delivery_fee,
    COALESCE(o.total_includes_delivery_fee, false) AS total_includes_delivery_fee,
    GREATEST(0,
      COALESCE(o.total, 0)::numeric
        - CASE WHEN COALESCE(o.total_includes_delivery_fee, false)
          THEN COALESCE(o.delivery_fee, 0)::numeric ELSE 0::numeric END
    ) AS net_total
  FROM public.pos_orders o
  LEFT JOIN public.transactions tx ON tx.id = o.transaction_id
  WHERE o.user_id = p_user_id
    AND o.state = 'paid'
    AND (
      o.business_date BETWEEN p_from AND p_to
      OR (
        p_from < (CURRENT_DATE - 60)
        AND o.business_date IS NULL
        AND o.created_at >= ((p_from::text || ' 00:00:00+03')::timestamptz)
        AND o.created_at <= ((p_to::text || ' 23:59:59.999+03')::timestamptz)
      )
    )
    AND (o.transaction_id IS NULL OR COALESCE(tx.is_deleted, false) = false)
),
paid_totals AS (
  SELECT
    COALESCE(SUM(net_total), 0)::numeric AS pos_total,
    COUNT(*)::integer AS pos_count,
    COALESCE(SUM(meal_subsidy_amount), 0)::numeric AS employee_meals
  FROM paid_orders
),
invoices_sold AS MATERIALIZED (
  SELECT i.id, i.total_amount, i.created_at, i.invoice_date
  FROM public.invoices i
  WHERE i.user_id = p_user_id
    AND i.invoice_type = 'sale'
    AND COALESCE(i.is_voided, false) = false
    AND i.status <> ALL (ARRAY['cancelled', 'void', 'reversed'])
    AND i.invoice_date BETWEEN p_from AND p_to
),
invoice_totals AS (
  SELECT
    COALESCE(SUM(COALESCE(total_amount, 0)), 0)::numeric AS inv_total,
    COUNT(*)::integer AS inv_count
  FROM invoices_sold
),
order_enriched AS MATERIALIZED (
  SELECT
    o.*,
    COALESCE(s.cashier_name, 'غير محدد') AS cashier_name,
    COALESCE(cb.branch_id, pt.branch_id) AS resolved_branch_id,
    COALESCE(COALESCE(cb.branch_id, pt.branch_id)::text, '__no_branch__') AS branch_key,
    CASE WHEN COALESCE(cb.branch_id, pt.branch_id) IS NULL THEN 'بدون فرع'
         ELSE COALESCE(br.name, 'فرع غير مسمى') END AS branch_name,
    COALESCE(cb.branch_location, '') AS branch_location
  FROM paid_orders o
  LEFT JOIN public.pos_sessions s ON s.id = o.session_id
  LEFT JOIN public.cash_boxes cb ON cb.id = s.cash_box_id
  LEFT JOIN public.pos_terminals pt ON pt.id = s.terminal_id
  LEFT JOIN public.branches br ON br.id = COALESCE(cb.branch_id, pt.branch_id)
  WHERE p_with_details
),
payments_raw AS MATERIALIZED (
  SELECT
    p.order_id,
    COALESCE(SUM(CASE WHEN p.payment_method = 'cash' THEN COALESCE(p.amount, 0) ELSE 0 END), 0)::numeric AS cash,
    COALESCE(SUM(CASE WHEN p.payment_method = 'card' THEN COALESCE(p.amount, 0) ELSE 0 END), 0)::numeric AS card,
    COALESCE(SUM(CASE WHEN p.payment_method = 'employee_account' THEN COALESCE(p.amount, 0) ELSE 0 END), 0)::numeric AS employee_account,
    COALESCE(SUM(CASE WHEN p.payment_method = 'credit' THEN COALESCE(p.amount, 0) ELSE 0 END), 0)::numeric AS credit
  FROM public.pos_payments p
  JOIN paid_orders o ON o.id = p.order_id
  WHERE p_with_details
  GROUP BY p.order_id
),
payments_adjusted AS MATERIALIZED (
  SELECT
    o.id AS order_id,
    CASE WHEN o.total_includes_delivery_fee
         THEN GREATEST(0, COALESCE(p.cash, 0) - LEAST(COALESCE(p.cash, 0), o.delivery_fee))
         ELSE COALESCE(p.cash, 0) END::numeric AS cash,
    CASE WHEN o.total_includes_delivery_fee
         THEN GREATEST(0, COALESCE(p.card, 0) - GREATEST(0, o.delivery_fee - COALESCE(p.cash, 0)))
         ELSE COALESCE(p.card, 0) END::numeric AS card,
    COALESCE(p.employee_account, 0)::numeric AS employee_account,
    COALESCE(p.credit, 0)::numeric AS credit
  FROM paid_orders o
  LEFT JOIN payments_raw p ON p.order_id = o.id
  WHERE p_with_details
),
cancelled_orders AS MATERIALIZED (
  SELECT
    o.id, o.session_id,
    GREATEST(0,
      COALESCE(o.total, 0)::numeric
        - CASE WHEN COALESCE(o.total_includes_delivery_fee, false)
          THEN COALESCE(o.delivery_fee, 0)::numeric ELSE 0::numeric END
    ) AS net_total
  FROM public.pos_orders o
  WHERE p_with_details
    AND o.user_id = p_user_id
    AND o.state = 'cancelled'
    AND o.business_date BETWEEN p_from AND p_to
),
cancelled_enriched AS MATERIALIZED (
  SELECT
    o.*,
    COALESCE(s.cashier_name, 'غير محدد') AS cashier_name,
    COALESCE(cb.branch_id, pt.branch_id) AS resolved_branch_id,
    COALESCE(COALESCE(cb.branch_id, pt.branch_id)::text, '__no_branch__') AS branch_key,
    CASE WHEN COALESCE(cb.branch_id, pt.branch_id) IS NULL THEN 'بدون فرع'
         ELSE COALESCE(br.name, 'فرع غير مسمى') END AS branch_name,
    COALESCE(cb.branch_location, '') AS branch_location
  FROM cancelled_orders o
  LEFT JOIN public.pos_sessions s ON s.id = o.session_id
  LEFT JOIN public.cash_boxes cb ON cb.id = s.cash_box_id
  LEFT JOIN public.pos_terminals pt ON pt.id = s.terminal_id
  LEFT JOIN public.branches br ON br.id = COALESCE(cb.branch_id, pt.branch_id)
),
branch_paid AS (
  SELECT
    e.branch_key,
    MIN(e.branch_name) AS name,
    MIN(e.branch_location) AS location,
    COALESCE(SUM(e.net_total), 0)::numeric AS total,
    COUNT(*)::integer AS order_count,
    COALESCE(SUM(p.cash), 0)::numeric AS cash,
    COALESCE(SUM(p.card), 0)::numeric AS card,
    COALESCE(SUM(p.employee_account), 0)::numeric AS employee_account,
    COALESCE(SUM(p.credit), 0)::numeric AS credit,
    COALESCE(SUM(e.meal_subsidy_amount), 0)::numeric AS employee_meals
  FROM order_enriched e
  LEFT JOIN payments_adjusted p ON p.order_id = e.id
  GROUP BY e.branch_key
),
branch_cancel AS (
  SELECT e.branch_key, MIN(e.branch_name) AS name, MIN(e.branch_location) AS location,
         COUNT(*)::integer AS cancelled_count,
         COALESCE(SUM(e.net_total), 0)::numeric AS cancelled_total
  FROM cancelled_enriched e GROUP BY e.branch_key
),
branch_keys AS (
  SELECT branch_key FROM branch_paid UNION SELECT branch_key FROM branch_cancel
),
branch_rows AS (
  SELECT
    k.branch_key AS id,
    COALESCE(bp.name, bc.name, 'بدون فرع') AS name,
    COALESCE(bp.location, bc.location, '') AS location,
    COALESCE(bp.total, 0)::numeric AS total,
    COALESCE(bp.order_count, 0)::integer AS order_count,
    COALESCE(bp.total, 0)::numeric AS gross,
    (COALESCE(bp.total, 0) - COALESCE(bp.employee_meals, 0))::numeric AS net,
    COALESCE(bp.cash, 0)::numeric AS cash,
    COALESCE(bp.card, 0)::numeric AS card,
    COALESCE(bp.employee_account, 0)::numeric AS employee_account,
    COALESCE(bp.credit, 0)::numeric AS credit,
    COALESCE(bp.employee_meals, 0)::numeric AS employee_meals,
    COALESCE(bc.cancelled_count, 0)::integer AS cancelled_count,
    COALESCE(bc.cancelled_total, 0)::numeric AS cancelled_total
  FROM branch_keys k
  LEFT JOIN branch_paid bp ON bp.branch_key = k.branch_key
  LEFT JOIN branch_cancel bc ON bc.branch_key = k.branch_key
  UNION ALL
  SELECT '__invoices__', 'فواتير المبيعات', 'المحاسبة', it.inv_total, it.inv_count,
         it.inv_total, it.inv_total, 0, 0, 0, 0, 0, 0, 0
  FROM invoice_totals it
  WHERE p_with_details AND it.inv_count > 0
),
branch_json AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'location', location,
    'total', total, 'orderCount', order_count,
    'gross', gross, 'net', net,
    'cash', cash, 'card', card,
    'employeeAccount', employee_account,
    'credit', credit,
    'employeeMeals', employee_meals,
    'cancelledCount', cancelled_count, 'cancelledTotal', cancelled_total
  ) ORDER BY total DESC), '[]'::jsonb) AS js
  FROM branch_rows WHERE p_with_details
),
cashier_paid AS (
  SELECT
    e.branch_key, MIN(e.branch_name) AS branch_name, e.cashier_name,
    COALESCE(SUM(e.net_total), 0)::numeric AS total,
    COUNT(*)::integer AS order_count,
    COALESCE(SUM(p.cash), 0)::numeric AS cash,
    COALESCE(SUM(p.card), 0)::numeric AS card,
    COALESCE(SUM(p.employee_account), 0)::numeric AS employee_account,
    COALESCE(SUM(p.credit), 0)::numeric AS credit,
    COALESCE(SUM(e.meal_subsidy_amount), 0)::numeric AS employee_meals
  FROM order_enriched e
  LEFT JOIN payments_adjusted p ON p.order_id = e.id
  GROUP BY e.branch_key, e.cashier_name
),
cashier_cancel AS (
  SELECT e.branch_key, MIN(e.branch_name) AS branch_name, e.cashier_name,
         COUNT(*)::integer AS cancelled_count,
         COALESCE(SUM(e.net_total), 0)::numeric AS cancelled_total
  FROM cancelled_enriched e GROUP BY e.branch_key, e.cashier_name
),
cashier_keys AS (
  SELECT branch_key, cashier_name FROM cashier_paid
  UNION SELECT branch_key, cashier_name FROM cashier_cancel
),
cashier_rows AS (
  SELECT
    k.branch_key AS branch_id,
    COALESCE(cp.branch_name, cc.branch_name, 'بدون فرع') AS branch_name,
    k.cashier_name AS name,
    COALESCE(cp.total, 0)::numeric AS total,
    COALESCE(cp.order_count, 0)::integer AS order_count,
    COALESCE(cp.total, 0)::numeric AS gross,
    (COALESCE(cp.total, 0) - COALESCE(cp.employee_meals, 0))::numeric AS net,
    COALESCE(cp.cash, 0)::numeric AS cash,
    COALESCE(cp.card, 0)::numeric AS card,
    COALESCE(cp.employee_account, 0)::numeric AS employee_account,
    COALESCE(cp.credit, 0)::numeric AS credit,
    COALESCE(cp.employee_meals, 0)::numeric AS employee_meals,
    COALESCE(cc.cancelled_count, 0)::integer AS cancelled_count,
    COALESCE(cc.cancelled_total, 0)::numeric AS cancelled_total
  FROM cashier_keys k
  LEFT JOIN cashier_paid cp ON cp.branch_key = k.branch_key AND cp.cashier_name = k.cashier_name
  LEFT JOIN cashier_cancel cc ON cc.branch_key = k.branch_key AND cc.cashier_name = k.cashier_name
),
cashier_json AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'branchId', branch_id, 'branchName', branch_name, 'name', name,
    'total', total, 'orderCount', order_count,
    'gross', gross, 'net', net,
    'cash', cash, 'card', card,
    'employeeAccount', employee_account,
    'credit', credit,
    'employeeMeals', employee_meals,
    'cancelledCount', cancelled_count, 'cancelledTotal', cancelled_total
  ) ORDER BY total DESC), '[]'::jsonb) AS js
  FROM cashier_rows WHERE p_with_details
),
item_rows AS (
  SELECT name, SUM(quantity)::numeric AS quantity, SUM(revenue)::numeric AS revenue
  FROM (
    SELECT COALESCE(l.product_name, 'غير معروف') AS name,
           COALESCE(SUM(l.qty), 0)::numeric AS quantity,
           COALESCE(SUM(l.total), 0)::numeric AS revenue
    FROM public.pos_order_lines l
    JOIN paid_orders o ON o.id = l.order_id
    WHERE p_with_details
    GROUP BY COALESCE(l.product_name, 'غير معروف')
    UNION ALL
    SELECT COALESCE(ii.product_name, ii.description, 'غير معروف') AS name,
           COALESCE(SUM(ii.quantity), 0)::numeric AS quantity,
           COALESCE(SUM(ii.total_amount), 0)::numeric AS revenue
    FROM public.invoice_items ii
    JOIN invoices_sold i ON i.id = ii.invoice_id
    WHERE p_with_details
    GROUP BY COALESCE(ii.product_name, ii.description, 'غير معروف')
  ) x GROUP BY name
),
item_json AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', name, 'quantity', quantity, 'revenue', revenue
  ) ORDER BY revenue DESC), '[]'::jsonb) AS js
  FROM item_rows WHERE p_with_details
),
cancel_totals AS (
  SELECT COUNT(*)::integer AS cancelled_count, COALESCE(SUM(net_total), 0)::numeric AS cancelled_total
  FROM cancelled_orders
),
payment_totals AS (
  SELECT
    COALESCE(SUM(cash), 0)::numeric AS cash,
    COALESCE(SUM(card), 0)::numeric AS card,
    COALESCE(SUM(employee_account), 0)::numeric AS employee_account,
    COALESCE(SUM(credit), 0)::numeric AS credit
  FROM payments_adjusted
)
SELECT jsonb_build_object(
  'total', (pt.pos_total + it.inv_total),
  'posTotal', pt.pos_total,
  'invTotal', it.inv_total,
  'orderCount', (pt.pos_count + it.inv_count),
  'byBranch', CASE WHEN p_with_details THEN COALESCE(bj.js, '[]'::jsonb) ELSE '[]'::jsonb END,
  'byItem', CASE WHEN p_with_details THEN COALESCE(ij.js, '[]'::jsonb) ELSE '[]'::jsonb END,
  'byCashier', CASE WHEN p_with_details THEN COALESCE(cj.js, '[]'::jsonb) ELSE '[]'::jsonb END,
  'summary', jsonb_build_object(
    'gross', (pt.pos_total + it.inv_total),
    'net', CASE WHEN p_with_details THEN (pt.pos_total + it.inv_total - pt.employee_meals) ELSE (pt.pos_total + it.inv_total) END,
    'cash', CASE WHEN p_with_details THEN COALESCE(pay.cash, 0) ELSE 0 END,
    'card', CASE WHEN p_with_details THEN COALESCE(pay.card, 0) ELSE 0 END,
    'employeeAccount', CASE WHEN p_with_details THEN COALESCE(pay.employee_account, 0) ELSE 0 END,
    'credit', CASE WHEN p_with_details THEN COALESCE(pay.credit, 0) ELSE 0 END,
    'employeeMeals', CASE WHEN p_with_details THEN pt.employee_meals ELSE 0 END,
    'cancelledCount', CASE WHEN p_with_details THEN COALESCE(ct.cancelled_count, 0) ELSE 0 END,
    'cancelledTotal', CASE WHEN p_with_details THEN COALESCE(ct.cancelled_total, 0) ELSE 0 END
  )
)
FROM paid_totals pt
CROSS JOIN invoice_totals it
LEFT JOIN branch_json bj ON true
LEFT JOIN item_json ij ON true
LEFT JOIN cashier_json cj ON true
LEFT JOIN cancel_totals ct ON true
LEFT JOIN payment_totals pay ON true;
$function$;