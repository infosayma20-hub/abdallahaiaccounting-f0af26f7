-- يعطي id صنف المشتريات المرتبط بمنتج من المخزون/نقطة البيع، وينشئه تلقائياً إذا غير موجود.
-- يستخدم من صفحة طلب مشتريات جديد عند اختيار صنف من كتالوج المخزون.
CREATE OR REPLACE FUNCTION public.ensure_procurement_item_from_product(p_product_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pr record;
  v_id uuid;
BEGIN
  IF p_product_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO pr FROM public.products WHERE id = p_product_id;
  IF pr.id IS NULL THEN RAISE EXCEPTION 'الصنف غير موجود'; END IF;
  IF NOT public.is_team_member(auth.uid(), pr.user_id) THEN RAISE EXCEPTION 'لا تملك صلاحية'; END IF;

  -- مرتبط مسبقاً عبر inventory_product_id
  SELECT id INTO v_id FROM public.procurement_items
   WHERE inventory_product_id = p_product_id LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- نفس الاسم بدون ربط → نربطه بدل إنشاء مكرر
  SELECT id INTO v_id FROM public.procurement_items
   WHERE user_id = pr.user_id AND name = pr.name LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.procurement_items SET inventory_product_id = p_product_id WHERE id = v_id;
    RETURN v_id;
  END IF;

  -- إنشاء صنف مشتريات جديد مرتبط بالمنتج
  INSERT INTO public.procurement_items
    (user_id, name, unit, default_price, is_active, sort_order, inventory_product_id)
  VALUES
    (pr.user_id, pr.name, coalesce(nullif(pr.unit, ''), 'قطعة'), coalesce(pr.buy_price, 0), true, 0, p_product_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.ensure_procurement_item_from_product(uuid) TO authenticated;
