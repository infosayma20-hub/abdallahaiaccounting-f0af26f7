CREATE OR REPLACE FUNCTION public.stock_count_search(p_query text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ctx jsonb; v_owner uuid; v_q text; v_tokens text[]; v_res jsonb;
BEGIN
  ctx := public.stock_count_context();
  SELECT user_id INTO v_owner FROM public.employees WHERE id = (ctx->>'employee_id')::uuid;
  v_q := btrim(regexp_replace(COALESCE(p_query,''), '\s+', ' ', 'g'));
  IF v_owner IS NULL OR length(v_q) < 1 THEN RETURN '[]'::jsonb; END IF;
  v_tokens := string_to_array(left(v_q, 80), ' ');
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'barcode', x.barcode,
           'sell_price', x.sell_price, 'image_url', x.image_url) ORDER BY x.rk, x.name), '[]'::jsonb)
    INTO v_res
  FROM (
    SELECT pr.id, pr.name, pr.barcode, pr.sell_price, pr.image_url,
           CASE WHEN pr.name ILIKE v_q || '%' THEN 0 WHEN pr.name ILIKE '%' || v_q || '%' THEN 1 ELSE 2 END rk
      FROM public.products pr
     WHERE pr.user_id = v_owner
       AND (SELECT bool_and(pr.name ILIKE '%' || replace(replace(t,'%','\%'),'_','\_') || '%' OR pr.barcode = t OR pr.sku = t)
              FROM unnest(v_tokens) t WHERE t <> '')
     ORDER BY rk, pr.name
     LIMIT 40
  ) x;
  RETURN v_res;
END $$;

CREATE OR REPLACE FUNCTION public.stock_count_get(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ctx jsonb; v_owner uuid; p record; v_qty numeric; v_pending numeric;
BEGIN
  ctx := public.stock_count_context();
  SELECT user_id INTO v_owner FROM public.employees WHERE id = (ctx->>'employee_id')::uuid;
  SELECT pr.id, pr.name, pr.sell_price, pr.barcode, pr.unit, pr.image_url INTO p
    FROM public.products pr WHERE pr.id = p_product_id AND pr.user_id = v_owner;
  IF p.id IS NULL THEN RETURN NULL; END IF;
  SELECT COALESCE(quantity_on_hand,0) INTO v_qty FROM public.product_warehouse_balances
   WHERE product_id = p.id AND warehouse_id = (ctx->>'warehouse_id')::uuid;
  SELECT counted_qty INTO v_pending FROM public.stock_count_entries
   WHERE product_id = p.id AND warehouse_id = (ctx->>'warehouse_id')::uuid AND status = 'pending'
   ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object('id', p.id, 'name', p.name, 'sell_price', p.sell_price, 'barcode', p.barcode,
    'unit', p.unit, 'image_url', p.image_url, 'system_qty', COALESCE(v_qty,0), 'pending_qty', v_pending);
END $$;

REVOKE ALL ON FUNCTION public.stock_count_search(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stock_count_get(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_count_search(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_count_get(uuid) TO authenticated;