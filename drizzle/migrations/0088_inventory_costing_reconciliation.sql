CREATE OR REPLACE FUNCTION public.inventory_costing_reconciliation()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid := COALESCE(public.get_team_owner_id(auth.uid()), auth.uid());
  s record; v_inv text; v_engine numeric; v_gl_acc numeric; v_gl_group numeric; v_unposted jsonb; v_neg int; v_zero int;
BEGIN
  IF auth.uid() IS NULL OR NOT (v_owner = auth.uid() OR public.is_team_member(auth.uid(), v_owner)) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;
  SELECT costing_engine_enabled, inventory_system, inventory_valuation_method, costing_effective_from
    INTO s FROM public.company_settings WHERE user_id = v_owner;
  IF NOT COALESCE(s.costing_engine_enabled,false) THEN
    RETURN jsonb_build_object('enabled', false);
  END IF;

  SELECT account_code INTO v_inv FROM public.accounts WHERE user_id = v_owner AND system_role = 'inventory_engine' LIMIT 1;
  SELECT COALESCE(round(SUM(total_value),2),0), COUNT(*) FILTER (WHERE quantity < 0), COUNT(*) FILTER (WHERE quantity > 0 AND avg_cost = 0)
    INTO v_engine, v_neg, v_zero FROM public.inventory_cost_balances WHERE user_id = v_owner;

  SELECT COALESCE(SUM(CASE WHEN debit_account_code = v_inv THEN amount ELSE 0 END)
                - SUM(CASE WHEN credit_account_code = v_inv THEN amount ELSE 0 END), 0)
    INTO v_gl_acc FROM public.transactions
   WHERE user_id = v_owner AND COALESCE(is_deleted,false) = false AND v_inv IS NOT NULL
     AND (debit_account_code = v_inv OR credit_account_code = v_inv);

  SELECT COALESCE(SUM(CASE WHEN a1.account_code IS NOT NULL THEN t.amount ELSE 0 END)
                - SUM(CASE WHEN a2.account_code IS NOT NULL THEN t.amount ELSE 0 END), 0)
    INTO v_gl_group
    FROM public.transactions t
    LEFT JOIN public.accounts a1 ON a1.user_id = t.user_id AND a1.account_code = t.debit_account_code
         AND (a1.account_code = '1140' OR a1.parent_code = '1140') AND a1.account_code NOT IN ('1145','1148','1149')
    LEFT JOIN public.accounts a2 ON a2.user_id = t.user_id AND a2.account_code = t.credit_account_code
         AND (a2.account_code = '1140' OR a2.parent_code = '1140') AND a2.account_code NOT IN ('1145','1148','1149')
   WHERE t.user_id = v_owner AND COALESCE(t.is_deleted,false) = false;

  -- movements valued by the engine but with no automatic GL entry (perpetual)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('reference_type', rt, 'entries', n, 'net_value', val) ORDER BY abs(val) DESC), '[]'::jsonb)
    INTO v_unposted
    FROM (
      SELECT COALESCE(e.reference_type,'(بدون مرجع)') rt, COUNT(*) n,
             round(SUM(CASE WHEN e.entry_type = 'in' THEN e.total_cost ELSE -e.total_cost END),2) val
        FROM public.inventory_cost_entries e
       WHERE e.user_id = v_owner AND e.entry_type IN ('in','out') AND e.reversed_at IS NULL
         AND COALESCE(e.reference_type,'') NOT IN ('pos_order_line_sale','pos_order_line_return','stock_transfer','stock_transfer_cancel')
         AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.user_id = v_owner AND t.idempotency_key = 'INVCOST-' || e.id)
       GROUP BY 1
    ) x;

  RETURN jsonb_build_object(
    'enabled', true, 'system', s.inventory_system, 'method', s.inventory_valuation_method,
    'effective_from', s.costing_effective_from, 'inventory_account', v_inv,
    'engine_value', v_engine, 'gl_engine_account', round(v_gl_acc,2), 'gl_inventory_group', round(v_gl_group,2),
    'negative_lines', v_neg, 'zero_cost_lines', v_zero, 'unposted', v_unposted);
END $$;
GRANT EXECUTE ON FUNCTION public.inventory_costing_reconciliation() TO authenticated;
