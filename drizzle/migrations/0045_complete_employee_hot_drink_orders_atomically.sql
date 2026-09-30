CREATE OR REPLACE FUNCTION public._pos_sync_stock_movements(p_order_id uuid, p_user_id uuid, p_is_return boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    p_user_id, l.product_id, v_mvt::stock_movement_type, l.qty,
    v_ref_type, l.id,
    CASE WHEN p_is_return THEN 'POS Return' ELSE 'POS Sale' END,
    v_warehouse, l.cost_price
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
  JOIN public.pos_orders o ON o.id = u.order_id AND o.state = 'paid'
  WHERE u.user_id = p_user_id
    AND u.employee_id = p_employee_id
    AND u.business_date = v_day;
END;
$$;

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
  WHERE o.id = p_order_id AND o.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'طلب نقطة البيع غير موجود' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.state = 'paid' THEN
    RAISE EXCEPTION 'تم تسجيل طلب المشروبات مسبقاً' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = p_employee_id AND e.user_id = p_user_id AND e.is_active = true
  ) THEN
    RAISE EXCEPTION 'الموظف غير موجود أو غير فعال' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.pos_order_lines l WHERE l.order_id = p_order_id) OR EXISTS (
    SELECT 1
    FROM public.pos_order_lines l
    LEFT JOIN public.products p ON p.id = l.product_id AND p.user_id = p_user_id
    LEFT JOIN public.pos_categories c ON c.id = p.pos_category_id AND c.user_id = p_user_id
    WHERE l.order_id = p_order_id
      AND (p.id IS NULL OR c.name IS DISTINCT FROM 'مشروبات ساخنة' OR COALESCE(l.notes, '') NOT LIKE '[EMPLOYEE_HOT_DRINK]%')
  ) THEN
    RAISE EXCEPTION 'طلب مشروبات الموظف يحتوي بنوداً غير مسموحة' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_employee_id::text || ':' || v_order.business_date::text, 0));

  SELECT COALESCE(SUM(u.discounted_quantity), 0)
  INTO v_used
  FROM public.employee_hot_drink_usage u
  JOIN public.pos_orders paid_order ON paid_order.id = u.order_id AND paid_order.state = 'paid'
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
      AND COALESCE(l.notes, '') LIKE '[EMPLOYEE_HOT_DRINK]%'
    ORDER BY l.created_at, l.id
  LOOP
    v_take := LEAST(v_remaining, v_line.qty);
    v_expected := ROUND((v_take * (v_line.sell_price * 0.5) + (v_line.qty - v_take) * v_line.sell_price)::NUMERIC, 2);

    IF ABS(COALESCE(v_line.total, 0) - v_expected) > 0.011 THEN
      RAISE EXCEPTION 'تغيّر الحد اليومي أو السعر؛ أعد فتح منيو المشروبات' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.employee_hot_drink_usage (
      user_id, company_id, employee_id, order_id, order_line_id, product_id,
      business_date, quantity, discounted_quantity, regular_quantity,
      regular_unit_price, charged_amount, created_by
    ) VALUES (
      p_user_id, v_order.company_id, p_employee_id, p_order_id, v_line.id, v_line.product_id,
      v_order.business_date, v_line.qty, v_take, v_line.qty - v_take,
      v_line.sell_price, v_line.total, (SELECT auth.uid())
    );

    v_discounted := v_discounted + v_take;
    v_regular := v_regular + (v_line.qty - v_take);
    v_charged := v_charged + v_line.total;
    v_remaining := GREATEST(0, v_remaining - v_take);
  END LOOP;

  RETURN QUERY SELECT v_discounted, v_regular, v_charged, v_remaining;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_employee_hot_drink_order(
  p_user_id UUID,
  p_employee_id UUID,
  p_order_id UUID,
  p_payments JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usage RECORD;
  v_result JSONB;
  v_order public.pos_orders%ROWTYPE;
  v_employee_name TEXT;
  v_items TEXT;
BEGIN
  SELECT * INTO v_usage
  FROM public.register_employee_hot_drink_order(p_user_id, p_employee_id, p_order_id);

  SELECT o.* INTO v_order FROM public.pos_orders o WHERE o.id = p_order_id;
  SELECT e.full_name INTO v_employee_name FROM public.employees e WHERE e.id = p_employee_id AND e.user_id = p_user_id;

  v_result := public.complete_pos_order(p_order_id, p_user_id, p_payments, 0);
  IF COALESCE((v_result->>'success')::BOOLEAN, false) IS NOT TRUE THEN
    RAISE EXCEPTION '%', COALESCE(v_result->>'error', 'تعذر إتمام طلب المشروبات');
  END IF;

  SELECT string_agg(l.product_name || ' ×' || trim(to_char(l.qty, 'FM999999990.###')), '، ' ORDER BY l.created_at, l.id)
  INTO v_items
  FROM public.pos_order_lines l
  WHERE l.order_id = p_order_id;

  INSERT INTO public.employee_financial_movements (
    user_id, employee_id, source_type, source_id, source_reference, reference_number,
    category, description, amount, movement_type, status, movement_date,
    salary_month, salary_year, created_by, notes, original_full_amount
  ) VALUES (
    p_user_id, p_employee_id, 'pos_hot_drink', p_order_id,
    v_result->>'order_number', v_result->>'order_number',
    'hot_drink', 'مشروبات ساخنة للموظف - ' || COALESCE(v_items, ''),
    v_usage.charged_amount, 'debit', 'approved', v_order.business_date,
    EXTRACT(MONTH FROM v_order.business_date)::INTEGER,
    EXTRACT(YEAR FROM v_order.business_date)::INTEGER,
    (SELECT auth.uid()),
    'أول مشروبين في يوم العمل بنصف السعر؛ المخفّض: ' || v_usage.discounted_quantity ||
      '، بالسعر العادي: ' || v_usage.regular_quantity ||
      '، الموظف: ' || COALESCE(v_employee_name, ''),
    v_usage.charged_amount
  );

  RETURN v_result || jsonb_build_object(
    'hot_drink_discounted_quantity', v_usage.discounted_quantity,
    'hot_drink_regular_quantity', v_usage.regular_quantity,
    'hot_drink_remaining', v_usage.discounted_remaining
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_employee_hot_drink_order(UUID, UUID, UUID, JSONB) TO authenticated, service_role;

COMMENT ON FUNCTION public.complete_employee_hot_drink_order(UUID, UUID, UUID, JSONB) IS 'يتمم طلب مشروبات الموظف ذريا: يتحقق من الفئة والسعر والحد اليومي، يسجل الاستهلاك والذمة، ويستثني البنود الموسومة من المخزون.';