CREATE OR REPLACE FUNCTION public.direct_receiving_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.employees;
BEGIN
  e := _direct_recv_employee();
  RETURN jsonb_build_object(
    'employee_id', e.id, 'employee_name', e.full_name,
    'suppliers', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
                  FROM pos_suppliers s WHERE s.user_id = e.user_id), '[]'),
    'branches', coalesce((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) ORDER BY b.name)
                  FROM branches b WHERE b.user_id = e.user_id), '[]'));
END $$;

CREATE OR REPLACE FUNCTION public.direct_receiving_scan(p_order_id uuid, p_barcode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.procurement_orders; v_code text := btrim(coalesce(p_barcode,'')); pr record; v_item uuid; v_line uuid; v_name text;
BEGIN
  o := _direct_recv_my_draft(p_order_id);
  IF v_code = '' THEN RAISE EXCEPTION 'باركود فارغ'; END IF;
  SELECT id, name, unit, buy_price INTO pr FROM products WHERE user_id = o.user_id AND barcode = v_code LIMIT 1;
  IF pr.id IS NULL THEN
    SELECT id, item_name INTO v_line, v_name FROM procurement_order_items WHERE order_id = p_order_id AND temp_barcode = v_code AND product_id IS NULL LIMIT 1;
    IF v_line IS NULL THEN RETURN jsonb_build_object('matched', false, 'barcode', v_code); END IF;
  ELSE
    v_item := _proc_item_for_product(pr.id);
    v_name := pr.name;
    SELECT id INTO v_line FROM procurement_order_items WHERE order_id = p_order_id AND product_id = v_item LIMIT 1;
    IF v_line IS NULL THEN
      INSERT INTO procurement_order_items(order_id, product_id, item_name, unit, quantity, unit_price, total_price, branch_id)
      VALUES (p_order_id, v_item, pr.name, coalesce(nullif(pr.unit,''),'قطعة'), 1, 0, 0, o.branch_id)
      RETURNING id INTO v_line;
      RETURN jsonb_build_object('matched', true, 'line_id', v_line, 'item_name', v_name, 'new', true);
    END IF;
  END IF;
  UPDATE procurement_order_items SET quantity = quantity + 1, total_price = round((quantity + 1) * unit_price, 2) WHERE id = v_line;
  PERFORM _direct_recv_recalc(p_order_id);
  RETURN jsonb_build_object('matched', true, 'line_id', v_line, 'item_name', v_name, 'new', false);
END $$;