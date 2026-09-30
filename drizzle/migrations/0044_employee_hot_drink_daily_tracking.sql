CREATE TABLE public.employee_hot_drink_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES public.pos_orders(id) ON DELETE RESTRICT,
  order_line_id UUID NOT NULL REFERENCES public.pos_order_lines(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  business_date DATE NOT NULL,
  quantity NUMERIC(10,3) NOT NULL,
  discounted_quantity NUMERIC(10,3) NOT NULL DEFAULT 0,
  regular_quantity NUMERIC(10,3) NOT NULL DEFAULT 0,
  regular_unit_price NUMERIC(12,2) NOT NULL,
  charged_amount NUMERIC(12,2) NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employee_hot_drink_usage_qty_check CHECK (
    quantity > 0
    AND discounted_quantity >= 0
    AND regular_quantity >= 0
    AND discounted_quantity + regular_quantity = quantity
  ),
  CONSTRAINT employee_hot_drink_usage_amount_check CHECK (
    regular_unit_price >= 0 AND charged_amount >= 0
  ),
  CONSTRAINT employee_hot_drink_usage_order_line_unique UNIQUE (order_line_id)
);

GRANT SELECT, INSERT ON public.employee_hot_drink_usage TO authenticated;
GRANT ALL ON public.employee_hot_drink_usage TO service_role;

ALTER TABLE public.employee_hot_drink_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view employee hot drink usage"
ON public.employee_hot_drink_usage
FOR SELECT TO authenticated
USING (
  public.is_team_member((SELECT auth.uid()), user_id)
  AND (
    public.user_can_access((SELECT auth.uid()), 'pos')
    OR public.user_can_access((SELECT auth.uid()), 'hr')
  )
);

CREATE INDEX employee_hot_drink_usage_daily_idx
ON public.employee_hot_drink_usage (user_id, employee_id, business_date);

CREATE INDEX employee_hot_drink_usage_order_idx
ON public.employee_hot_drink_usage (order_id);

CREATE OR REPLACE FUNCTION public.get_employee_hot_drink_daily_status(
  p_user_id UUID,
  p_employee_id UUID,
  p_business_date DATE DEFAULT NULL
)
RETURNS TABLE (
  business_date DATE,
  discounted_used NUMERIC,
  discounted_remaining NUMERIC,
  total_used NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day DATE;
BEGIN
  PERFORM public.assert_owner_scope(p_user_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = p_employee_id AND e.user_id = p_user_id AND e.is_active = true
  ) THEN
    RAISE EXCEPTION 'الموظف غير موجود أو غير فعال' USING ERRCODE = 'P0002';
  END IF;

  v_day := COALESCE(p_business_date, public.pos_business_date(now(), 6));

  RETURN QUERY
  SELECT
    v_day,
    COALESCE(SUM(u.discounted_quantity), 0)::NUMERIC,
    GREATEST(0::NUMERIC, 2::NUMERIC - COALESCE(SUM(u.discounted_quantity), 0))::NUMERIC,
    COALESCE(SUM(u.quantity), 0)::NUMERIC
  FROM public.employee_hot_drink_usage u
  WHERE u.user_id = p_user_id
    AND u.employee_id = p_employee_id
    AND u.business_date = v_day;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_employee_hot_drink_daily_status(UUID, UUID, DATE) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.register_employee_hot_drink_order(
  p_user_id UUID,
  p_employee_id UUID,
  p_order_id UUID
)
RETURNS TABLE (
  discounted_quantity NUMERIC,
  regular_quantity NUMERIC,
  charged_amount NUMERIC,
  discounted_remaining NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.pos_orders%ROWTYPE;
  v_used NUMERIC := 0;
  v_remaining NUMERIC := 0;
  v_discounted NUMERIC := 0;
  v_regular NUMERIC := 0;
  v_charged NUMERIC := 0;
  v_take NUMERIC := 0;
  v_expected NUMERIC := 0;
  v_line RECORD;
BEGIN
  PERFORM public.assert_owner_scope(p_user_id);

  IF NOT public.user_can_access((SELECT auth.uid()), 'pos') THEN
    RAISE EXCEPTION 'غير مصرح بتسجيل مشروبات الموظفين' USING ERRCODE = '42501';
  END IF;

  SELECT o.* INTO v_order
  FROM public.pos_orders o
  WHERE o.id = p_order_id AND o.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'طلب نقطة البيع غير موجود' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = p_employee_id AND e.user_id = p_user_id AND e.is_active = true
  ) THEN
    RAISE EXCEPTION 'الموظف غير موجود أو غير فعال' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_employee_id::text || ':' || v_order.business_date::text, 0));

  SELECT COALESCE(SUM(u.discounted_quantity), 0)
  INTO v_used
  FROM public.employee_hot_drink_usage u
  WHERE u.user_id = p_user_id
    AND u.employee_id = p_employee_id
    AND u.business_date = v_order.business_date;

  v_remaining := GREATEST(0, 2 - v_used);

  FOR v_line IN
    SELECT l.id, l.product_id, l.qty, l.unit_price, l.total, p.sell_price
    FROM public.pos_order_lines l
    JOIN public.products p ON p.id = l.product_id AND p.user_id = p_user_id
    JOIN public.pos_categories c ON c.id = p.pos_category_id AND c.user_id = p_user_id
    WHERE l.order_id = p_order_id
      AND l.user_id = p_user_id
      AND c.name = 'مشروبات ساخنة'
    ORDER BY l.created_at, l.id
  LOOP
    v_take := LEAST(v_remaining, v_line.qty);
    v_expected := ROUND((v_take * (v_line.sell_price * 0.5) + (v_line.qty - v_take) * v_line.sell_price)::NUMERIC, 2);

    IF ABS(COALESCE(v_line.total, 0) - v_expected) > 0.011 THEN
      RAISE EXCEPTION 'سعر مشروبات الموظف غير صحيح؛ أعد فتح المنيو لتحديث الحد اليومي' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.employee_hot_drink_usage (
      user_id, company_id, employee_id, order_id, order_line_id, product_id,
      business_date, quantity, discounted_quantity, regular_quantity,
      regular_unit_price, charged_amount, created_by
    ) VALUES (
      p_user_id, v_order.company_id, p_employee_id, p_order_id, v_line.id, v_line.product_id,
      v_order.business_date, v_line.qty, v_take, v_line.qty - v_take,
      v_line.sell_price, v_line.total, (SELECT auth.uid())
    )
    ON CONFLICT (order_line_id) DO NOTHING;

    v_discounted := v_discounted + v_take;
    v_regular := v_regular + (v_line.qty - v_take);
    v_charged := v_charged + v_line.total;
    v_remaining := GREATEST(0, v_remaining - v_take);
  END LOOP;

  RETURN QUERY SELECT v_discounted, v_regular, v_charged, v_remaining;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_employee_hot_drink_order(UUID, UUID, UUID) TO authenticated, service_role;

COMMENT ON TABLE public.employee_hot_drink_usage IS 'سجل مدقق لاستهلاك المشروبات الساخنة للموظفين: أول مشروبين في يوم عمل نقطة البيع بنصف السعر ثم السعر العادي، دون حركة مخزون.';