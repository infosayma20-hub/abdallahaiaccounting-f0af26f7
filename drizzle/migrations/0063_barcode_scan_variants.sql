-- مطابقة باركود أمتن: أرقام عربية/فارسية → لاتينية، حذف المسافات، وتكافؤ UPC-A(12) مع EAN-13 بصفر بادئ، ودعم الباركودات الإضافية للصنف.
-- التراجع: إعادة تعريف receiving_scan و direct_receiving_scan بالنسخ السابقة (مطابقة نصية حرفية) وحذف _barcode_variants.
CREATE OR REPLACE FUNCTION public._barcode_variants(p_code text)
RETURNS text[]
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE c text;
BEGIN
  c := translate(coalesce(p_code,''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  c := regexp_replace(c, '\s+', '', 'g');
  IF c = '' THEN RETURN ARRAY[]::text[]; END IF;
  IF c ~ '^\d{12}$' THEN RETURN ARRAY[c, '0' || c]; END IF;
  IF c ~ '^0\d{12}$' THEN RETURN ARRAY[c, substr(c, 2)]; END IF;
  RETURN ARRAY[c];
END $$;

CREATE OR REPLACE FUNCTION public.receiving_scan(p_session_id uuid, p_barcode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s public.procurement_receiving_sessions; v_line uuid; v_name text; v_qty numeric;
  v_vars text[] := public._barcode_variants(p_barcode); v_code text;
BEGIN
  s := public._receiving_can_access(p_session_id, false);
  PERFORM public._receiving_assert_editable(s);
  v_code := coalesce(v_vars[1], '');
  IF v_code = '' THEN RETURN jsonb_build_object('ok', false, 'reason', 'empty'); END IF;
  SELECT l.id, i.item_name INTO v_line, v_name
  FROM public.procurement_receiving_lines l
  JOIN public.procurement_order_items i ON i.id = l.order_item_id
  LEFT JOIN public.products p ON p.id = l.product_id
  WHERE l.session_id = p_session_id AND (
        btrim(p.barcode) = ANY(v_vars)
     OR l.barcodes && v_vars
     OR btrim(p.sku) = ANY(v_vars)
     OR EXISTS (SELECT 1 FROM public.product_barcodes pb WHERE pb.product_id = l.product_id AND btrim(pb.barcode) = ANY(v_vars)))
  ORDER BY (l.scanned_qty >= i.quantity), i.item_name LIMIT 1;
  IF v_line IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown', 'barcode', v_code); END IF;
  UPDATE public.procurement_receiving_lines SET scanned_qty = scanned_qty + 1, updated_at = now() WHERE id = v_line RETURNING scanned_qty INTO v_qty;
  UPDATE public.procurement_receiving_sessions SET status='in_progress', started_at=coalesce(started_at, now()), updated_at=now() WHERE id = p_session_id;
  RETURN jsonb_build_object('ok', true, 'line_id', v_line, 'item_name', v_name, 'scanned_qty', v_qty);
END $function$;

CREATE OR REPLACE FUNCTION public.direct_receiving_scan(p_order_id uuid, p_barcode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o public.procurement_orders; v_vars text[] := public._barcode_variants(p_barcode); v_code text;
  pr record; v_item uuid; v_line uuid; v_name text;
BEGIN
  o := _direct_recv_my_draft(p_order_id);
  v_code := coalesce(v_vars[1], '');
  IF v_code = '' THEN RAISE EXCEPTION 'باركود فارغ'; END IF;
  SELECT id, name, unit, buy_price INTO pr FROM products
   WHERE user_id = o.user_id AND barcode = ANY(v_vars)
   ORDER BY (barcode = v_code) DESC LIMIT 1;
  IF pr.id IS NULL THEN
    SELECT p.id, p.name, p.unit, p.buy_price INTO pr FROM product_barcodes pb JOIN products p ON p.id = pb.product_id
     WHERE pb.user_id = o.user_id AND p.user_id = o.user_id AND btrim(pb.barcode) = ANY(v_vars) LIMIT 1;
  END IF;
  IF pr.id IS NULL THEN
    SELECT id, item_name INTO v_line, v_name FROM procurement_order_items WHERE order_id = p_order_id AND temp_barcode = ANY(v_vars) AND product_id IS NULL LIMIT 1;
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
END $function$;