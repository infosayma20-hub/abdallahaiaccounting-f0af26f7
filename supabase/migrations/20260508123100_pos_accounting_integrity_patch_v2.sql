-- =====================================================================
-- POS Accounting Integrity Patch — V2 CORRECTIONS (QA-only, NOT auto-applied)
-- Supersedes the helpers + idempotency design of:
--   20260508123000_pos_accounting_integrity_patch.sql
--
-- Why V2:
--   * V1 hardcoded VAT account '2310' (wrong for Palestinian standard).
--   * V1 used DELETE+INSERT idempotency on pos_sale / pos_return refs.
--
-- V2 corrections:
--   1. _pos_vat_output_account() resolves dynamically via:
--        tax_settings.output_tax_account_code (active row, latest)
--        → company_settings.vat_sales_account
--        → accounts.system_role = 'vat_output'
--        → '2190'  (Palestinian VAT Output standard — final fallback)
--      NEVER returns '2310'.
--   2. stock_movements idempotency now LINE-LEVEL:
--        reference_type = 'pos_order_line_sale'   (sales)
--        reference_type = 'pos_order_line_return' (returns)
--        reference_id   = pos_order_lines.id
--      Backed by partial UNIQUE INDEX + ON CONFLICT DO NOTHING.
--      No DELETE — safe under retries / partial failures.
--
-- Untouched: complete_pos_order / process_pos_return RPC bodies (V1).
-- They call these helpers, so they pick up the corrected behavior
-- automatically when V1 + V2 are applied in order.
-- =====================================================================

-- 1) Partial unique index — line-level POS stock_movements idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_pos_order_line_idem
  ON public.stock_movements (reference_type, reference_id)
  WHERE reference_type IN ('pos_order_line_sale', 'pos_order_line_return')
    AND reference_id IS NOT NULL;

-- 2) VAT Output account resolver — dynamic, 2190 final fallback
CREATE OR REPLACE FUNCTION public._pos_vat_output_account(p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT NULLIF(output_tax_account_code, '')
       FROM public.tax_settings
       WHERE user_id = p_user_id AND COALESCE(is_active, true) = true
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 1),
    (SELECT NULLIF(vat_sales_account, '')
       FROM public.company_settings
       WHERE user_id = p_user_id
       LIMIT 1),
    (SELECT account_code
       FROM public.accounts
       WHERE user_id = p_user_id
         AND system_role = 'vat_output'
         AND COALESCE(is_active, true) = true
       ORDER BY account_code
       LIMIT 1),
    '2190'
  );
$$;

-- 3) Line-level idempotent stock_movements writer
--    No DELETE. ON CONFLICT DO NOTHING via partial unique index above.
CREATE OR REPLACE FUNCTION public._pos_sync_stock_movements(
  p_order_id uuid, p_user_id uuid, p_is_return boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ref_type text := CASE WHEN p_is_return
                          THEN 'pos_order_line_return'
                          ELSE 'pos_order_line_sale' END;
  v_mvt      text := CASE WHEN p_is_return THEN 'وارد' ELSE 'صادر' END;
  v_warehouse uuid;
  v_branch_id uuid;
BEGIN
  SELECT t.branch_id INTO v_branch_id
  FROM public.pos_orders o
  JOIN public.pos_sessions s ON s.id = o.session_id
  JOIN public.pos_terminals t ON t.id = s.terminal_id
  WHERE o.id = p_order_id;

  IF v_branch_id IS NOT NULL THEN
    SELECT id INTO v_warehouse
    FROM public.warehouses
    WHERE user_id = p_user_id AND branch_id = v_branch_id
    ORDER BY is_default DESC NULLS LAST, created_at ASC
    LIMIT 1;
  END IF;

  INSERT INTO public.stock_movements (
    user_id, product_id, movement_type, quantity,
    reference_type, reference_id, reference_note,
    warehouse_id, unit_cost
  )
  SELECT
    p_user_id, l.product_id, v_mvt::stock_movement_type, l.qty,
    v_ref_type, l.id,
    CASE WHEN p_is_return THEN 'POS Return' ELSE 'POS Sale' END,
    v_warehouse, l.cost_price
  FROM public.pos_order_lines l
  WHERE l.order_id = p_order_id
    AND l.product_id IS NOT NULL
    AND l.qty > 0
  ON CONFLICT (reference_type, reference_id) DO NOTHING;
END;
$$;
