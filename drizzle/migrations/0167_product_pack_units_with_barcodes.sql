ALTER TABLE public.product_units ADD COLUMN IF NOT EXISTS sale_price numeric;
ALTER TABLE public.pos_order_lines ADD COLUMN IF NOT EXISTS unit_id uuid, ADD COLUMN IF NOT EXISTS unit_factor numeric;
COMMENT ON COLUMN public.pos_order_lines.unit_factor IS 'Base units per sold unit (e.g. carton=12); NULL means 1. Frozen at insert.';

-- Resolve pack unit on new POS lines from the unit name (sales) or the original line (returns)
CREATE OR REPLACE FUNCTION public.tg_pos_line_unit_factor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u record; v_orig uuid;
BEGIN
  IF NEW.unit_factor IS NOT NULL OR NEW.product_id IS NULL THEN RETURN NEW; END IF;
  SELECT original_order_id INTO v_orig FROM public.pos_orders WHERE id = NEW.order_id AND is_return;
  IF v_orig IS NOT NULL THEN
    SELECT unit_id, unit_factor INTO NEW.unit_id, NEW.unit_factor FROM public.pos_order_lines
     WHERE order_id = v_orig AND product_id = NEW.product_id AND product_name = NEW.product_name AND unit_factor IS NOT NULL LIMIT 1;
    RETURN NEW;
  END IF;
  IF nullif(btrim(NEW.unit),'') IS NULL THEN RETURN NEW; END IF;
  SELECT u.id, u.conversion_factor INTO v_u FROM public.product_units u JOIN public.products p ON p.id = u.product_id
   WHERE u.product_id = NEW.product_id AND COALESCE(u.is_active,true) AND btrim(u.unit_name) = btrim(NEW.unit)
     AND btrim(u.unit_name) IS DISTINCT FROM btrim(COALESCE(p.unit,'')) AND u.conversion_factor > 0 AND u.conversion_factor <> 1
   LIMIT 1;
  IF v_u.id IS NOT NULL THEN NEW.unit_id := v_u.id; NEW.unit_factor := v_u.conversion_factor; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_00_pos_line_unit_factor ON public.pos_order_lines;
CREATE TRIGGER trg_00_pos_line_unit_factor BEFORE INSERT ON public.pos_order_lines FOR EACH ROW EXECUTE FUNCTION public.tg_pos_line_unit_factor();

-- Stock moves in base units
CREATE OR REPLACE FUNCTION public._pos_sync_stock_movements(p_order_id uuid, p_user_id uuid, p_is_return boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ref_type text := CASE WHEN p_is_return THEN 'pos_order_line_return' ELSE 'pos_order_line_sale' END;
  v_mvt text := CASE WHEN p_is_return THEN 'وارد' ELSE 'صادر' END;
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
    p_user_id, l.product_id, v_mvt::stock_movement_type, l.qty * COALESCE(l.unit_factor, 1),
    v_ref_type, l.id,
    CASE WHEN p_is_return THEN 'POS Return' ELSE 'POS Sale' END,
    v_warehouse, l.cost_price / COALESCE(NULLIF(l.unit_factor, 0), 1)
  FROM public.pos_order_lines l
  WHERE l.order_id = p_order_id
    AND l.product_id IS NOT NULL
    AND l.qty > 0
    AND COALESCE(l.notes, '') NOT LIKE '[EMPLOYEE_HOT_DRINK]%'
  ON CONFLICT (reference_type, reference_id)
    WHERE reference_type IN ('pos_order_line_sale', 'pos_order_line_return')
      AND reference_id IS NOT NULL
  DO NOTHING;
END;
$function$;

-- Damaged return write-off in base units
DO $do$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE proname='pos_return_v2' AND pronamespace='public'::regnamespace;
  n := replace(d, 'rl.qty, ''pos_return_damage''', 'rl.qty * COALESCE(rl.unit_factor,1), ''pos_return_damage''');
  n := replace(n, 'v_warehouse, rl.cost_price, ''تالف من مرتجع ''', 'v_warehouse, rl.cost_price / COALESCE(NULLIF(rl.unit_factor,0),1), ''تالف من مرتجع ''');
  IF n = d OR position('COALESCE(rl.unit_factor,1)' in n) = 0 OR position('NULLIF(rl.unit_factor,0)' in n) = 0 THEN
    RAISE EXCEPTION 'pos_return_v2 patch did not apply';
  END IF;
  EXECUTE n;
END $do$;

-- Barcode uniqueness across products, extra barcodes and pack units
CREATE OR REPLACE FUNCTION public.enforce_unique_product_barcode()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_code text; v_pid uuid; v_other text; v_self uuid;
BEGIN
  v_code := nullif(trim(NEW.barcode),'');
  IF TG_TABLE_NAME = 'products' THEN v_pid := NEW.id; ELSE v_pid := NEW.product_id; END IF;
  IF TG_TABLE_NAME = 'product_units' THEN v_self := NEW.id; END IF;
  IF v_code IS NULL THEN RETURN NEW; END IF;
  NEW.barcode := v_code;

  SELECT p.name INTO v_other FROM products p
   WHERE p.user_id = NEW.user_id AND p.id <> v_pid AND trim(p.barcode) = v_code LIMIT 1;
  IF v_other IS NULL THEN
    SELECT p.name INTO v_other FROM product_barcodes b JOIN products p ON p.id = b.product_id
     WHERE b.user_id = NEW.user_id AND b.product_id <> v_pid AND trim(b.barcode) = v_code LIMIT 1;
  END IF;
  IF v_other IS NULL THEN
    SELECT p.name INTO v_other FROM product_units u JOIN products p ON p.id = u.product_id
     WHERE u.user_id = NEW.user_id AND u.product_id <> v_pid AND trim(u.barcode) = v_code LIMIT 1;
  END IF;
  IF v_other IS NULL AND TG_TABLE_NAME = 'product_units' THEN
    SELECT p.name INTO v_other FROM products p WHERE p.id = v_pid AND trim(p.barcode) = v_code;
    IF v_other IS NULL THEN
      SELECT p.name INTO v_other FROM product_barcodes b JOIN products p ON p.id=b.product_id WHERE b.product_id = v_pid AND trim(b.barcode) = v_code LIMIT 1;
    END IF;
    IF v_other IS NULL THEN
      SELECT p.name INTO v_other FROM product_units u JOIN products p ON p.id=u.product_id WHERE u.product_id = v_pid AND u.id IS DISTINCT FROM v_self AND trim(u.barcode) = v_code LIMIT 1;
    END IF;
    IF v_other IS NOT NULL THEN
      RAISE EXCEPTION 'باركود الوحدة مستخدم مسبقًا على نفس الصنف (%)', v_other USING ERRCODE = '23505';
    END IF;
  END IF;
  IF v_other IS NOT NULL THEN
    RAISE EXCEPTION 'الباركود % مستخدم لصنف آخر: %', v_code, v_other USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_unique_product_unit_barcode ON public.product_units;
CREATE TRIGGER trg_unique_product_unit_barcode BEFORE INSERT OR UPDATE OF barcode ON public.product_units
  FOR EACH ROW EXECUTE FUNCTION public.enforce_unique_product_barcode();

-- Stock count: list pack units of a product
CREATE OR REPLACE FUNCTION public.stock_count_pack_units(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ctx jsonb; v_owner uuid; v_res jsonb;
BEGIN
  ctx := public.stock_count_context();
  SELECT user_id INTO v_owner FROM public.employees WHERE id = (ctx->>'employee_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id=p_product_id AND user_id=v_owner) THEN RAISE EXCEPTION 'الصنف غير موجود'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',u.id,'name',u.unit_name,'factor',u.conversion_factor,'price',u.sale_price,'barcode',u.barcode,
     'used', EXISTS(SELECT 1 FROM public.pos_order_lines l WHERE l.unit_id=u.id)) ORDER BY u.conversion_factor, u.unit_name),'[]'::jsonb)
   INTO v_res FROM public.product_units u
   WHERE u.product_id=p_product_id AND u.user_id=v_owner AND COALESCE(u.is_active,true) AND u.conversion_factor > 0 AND u.conversion_factor <> 1;
  RETURN v_res;
END $$;

-- Stock count: add/edit a pack unit (name, pieces, price, barcode)
CREATE OR REPLACE FUNCTION public.stock_count_set_pack_unit(p_product_id uuid, p_unit_id uuid, p_name text, p_factor numeric, p_price numeric, p_barcode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ctx jsonb; v_emp uuid; v_owner uuid; v_base text; v_name text := nullif(btrim(p_name),''); v_code text := (public._barcode_variants(p_barcode))[1];
  o record; v_id uuid;
BEGIN
  ctx := public.stock_count_context(); v_emp := (ctx->>'employee_id')::uuid;
  SELECT user_id INTO v_owner FROM public.employees WHERE id=v_emp;
  PERFORM pg_advisory_xact_lock(hashtextextended('stock_count_barcodes:'||v_owner::text,0));
  SELECT btrim(COALESCE(unit,'')) INTO v_base FROM public.products WHERE id=p_product_id AND user_id=v_owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الصنف غير موجود'; END IF;
  IF v_name IS NULL OR length(v_name) > 80 THEN RAISE EXCEPTION 'اكتب اسم الوحدة'; END IF;
  IF v_name = v_base THEN RAISE EXCEPTION 'هذه وحدة الصنف الأساسية؛ اختر اسمًا آخر مثل كرتونة'; END IF;
  IF p_factor IS NULL OR p_factor <= 0 OR p_factor = 1 OR p_factor > 100000 THEN RAISE EXCEPTION 'عدد القطع داخل الوحدة يجب أن يكون أكبر من 1'; END IF;
  IF p_price IS NULL OR p_price < 0 THEN RAISE EXCEPTION 'اكتب سعر بيع الوحدة'; END IF;
  IF EXISTS (SELECT 1 FROM public.product_units WHERE product_id=p_product_id AND user_id=v_owner AND btrim(unit_name)=v_name AND id IS DISTINCT FROM p_unit_id AND COALESCE(is_active,true)) THEN
    RAISE EXCEPTION 'الوحدة «%» موجودة مسبقًا لهذا الصنف', v_name; END IF;
  IF p_unit_id IS NULL THEN
    INSERT INTO public.product_units(product_id,user_id,unit_name,conversion_factor,sale_price,barcode,is_sale,is_purchase,is_default,is_active)
    VALUES (p_product_id,v_owner,v_name,p_factor,p_price,v_code,true,true,false,true) RETURNING id INTO v_id;
    INSERT INTO public.product_edit_log(user_id,product_id,employee_id,changed_by,field,old_value,new_value)
     VALUES(v_owner,p_product_id,v_emp,auth.uid(),'pack_unit',NULL, v_name||' × '||p_factor||' | '||p_price||' | '||COALESCE(v_code,'-'));
  ELSE
    SELECT * INTO o FROM public.product_units WHERE id=p_unit_id AND product_id=p_product_id AND user_id=v_owner FOR UPDATE;
    IF o.id IS NULL THEN RAISE EXCEPTION 'الوحدة غير موجودة'; END IF;
    IF (o.conversion_factor <> p_factor OR btrim(o.unit_name) <> v_name) AND EXISTS (SELECT 1 FROM public.pos_order_lines WHERE unit_id=o.id) THEN
      RAISE EXCEPTION 'هذه الوحدة استُخدمت في فواتير؛ لا يمكن تغيير اسمها أو عدد قطعها (يمكن تعديل السعر والباركود)'; END IF;
    UPDATE public.product_units SET unit_name=v_name, conversion_factor=p_factor, sale_price=p_price, barcode=v_code WHERE id=o.id;
    v_id := o.id;
    INSERT INTO public.product_edit_log(user_id,product_id,employee_id,changed_by,field,old_value,new_value)
     VALUES(v_owner,p_product_id,v_emp,auth.uid(),'pack_unit',
       o.unit_name||' × '||o.conversion_factor||' | '||COALESCE(o.sale_price::text,'-')||' | '||COALESCE(o.barcode,'-'),
       v_name||' × '||p_factor||' | '||p_price||' | '||COALESCE(v_code,'-'));
  END IF;
  RETURN jsonb_build_object('id', v_id);
END $$;

-- Stock count lookup also resolves pack-unit barcodes
CREATE OR REPLACE FUNCTION public.stock_count_lookup(p_code text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE ctx jsonb; v_owner uuid; p record; v_qty numeric; v_pending numeric; v_pack jsonb;
BEGIN
  ctx := public.stock_count_context();
  SELECT user_id INTO v_owner FROM public.employees WHERE id = (ctx->>'employee_id')::uuid;
  SELECT pr.id, pr.name, pr.sell_price, pr.barcode, pr.unit, pr.image_url INTO p FROM public.products pr
   WHERE pr.user_id = v_owner AND (
     pr.barcode = ANY(public._barcode_variants(p_code)) OR pr.sku = btrim(p_code)
     OR pr.id IN (SELECT pb.product_id FROM public.product_barcodes pb
                  WHERE pb.user_id = v_owner AND pb.barcode = ANY(public._barcode_variants(p_code))))
   LIMIT 1;
  IF p.id IS NULL THEN
    SELECT pr.id, pr.name, pr.sell_price, pr.barcode, pr.unit, pr.image_url, u.id uid, u.unit_name, u.conversion_factor INTO p
      FROM public.product_units u JOIN public.products pr ON pr.id=u.product_id
     WHERE u.user_id=v_owner AND COALESCE(u.is_active,true) AND u.barcode = ANY(public._barcode_variants(p_code)) LIMIT 1;
    IF p.id IS NULL THEN RETURN NULL; END IF;
    v_pack := jsonb_build_object('id',p.uid,'name',p.unit_name,'factor',p.conversion_factor);
  END IF;
  SELECT COALESCE(quantity_on_hand,0) INTO v_qty FROM public.product_warehouse_balances
   WHERE product_id = p.id AND warehouse_id = (ctx->>'warehouse_id')::uuid;
  SELECT counted_qty INTO v_pending FROM public.stock_count_entries
   WHERE product_id = p.id AND warehouse_id = (ctx->>'warehouse_id')::uuid AND status = 'pending'
   ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object('id', p.id, 'name', p.name, 'sell_price', p.sell_price, 'barcode', p.barcode,
    'unit', p.unit, 'image_url', p.image_url, 'system_qty', COALESCE(v_qty,0), 'pending_qty', v_pending, 'scanned_pack', v_pack);
END
$function$;

GRANT EXECUTE ON FUNCTION public.stock_count_pack_units(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_count_set_pack_unit(uuid,uuid,text,numeric,numeric,text) TO authenticated;