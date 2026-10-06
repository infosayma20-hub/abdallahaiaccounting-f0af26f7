CREATE OR REPLACE FUNCTION public.stock_count_lookup(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE ctx jsonb; v_owner uuid; p record; v_qty numeric; v_pending numeric;
BEGIN
  ctx := public.stock_count_context();
  SELECT user_id INTO v_owner FROM public.employees WHERE id = (ctx->>'employee_id')::uuid;
  SELECT pr.id, pr.name, pr.sell_price, pr.barcode, pr.unit, pr.image_url INTO p FROM public.products pr
   WHERE pr.user_id = v_owner AND (
     pr.barcode = ANY(public._barcode_variants(p_code)) OR pr.sku = btrim(p_code)
     OR pr.id IN (SELECT pb.product_id FROM public.product_barcodes pb
                   WHERE pb.user_id = v_owner AND pb.barcode = ANY(public._barcode_variants(p_code))))
   LIMIT 1;
  IF p.id IS NULL THEN RETURN NULL; END IF;
  SELECT COALESCE(quantity_on_hand,0) INTO v_qty FROM public.product_warehouse_balances
   WHERE product_id = p.id AND warehouse_id = (ctx->>'warehouse_id')::uuid;
  SELECT counted_qty INTO v_pending FROM public.stock_count_entries
   WHERE product_id = p.id AND warehouse_id = (ctx->>'warehouse_id')::uuid AND status = 'pending'
   ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object('id', p.id, 'name', p.name, 'sell_price', p.sell_price, 'barcode', p.barcode,
    'unit', p.unit, 'image_url', p.image_url, 'system_qty', COALESCE(v_qty,0), 'pending_qty', v_pending);
END
$fn$;