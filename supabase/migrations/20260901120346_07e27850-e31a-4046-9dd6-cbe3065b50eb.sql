-- 1) Central accountant permission check (bypasses admins & non-accountant users)
CREATE OR REPLACE FUNCTION public.accountant_perm(_perm text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_roles text[];
  v_ok boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN true; -- service/definer contexts are not restricted here
  END IF;

  SELECT array_agg(role::text) INTO v_roles
    FROM public.user_roles WHERE user_id = v_uid;

  IF v_roles IS NULL OR array_length(v_roles, 1) IS NULL THEN
    RETURN true;
  END IF;
  IF 'admin' = ANY(v_roles) OR 'super_admin' = ANY(v_roles) THEN
    RETURN true;
  END IF;
  -- only accountant-only users are subject to these checks
  IF EXISTS (SELECT 1 FROM unnest(v_roles) r WHERE r NOT LIKE 'accountant\_%') THEN
    RETURN true;
  END IF;

  EXECUTE format(
    'SELECT COALESCE(bool_or(%I), false) FROM public.accountant_permissions
       WHERE accountant_auth_id = $1 AND is_active = true', _perm)
  INTO v_ok USING v_uid;

  RETURN COALESCE(v_ok, false);
END;
$$;

-- 2) Product card: accountants without can_manage_products are read-only.
--    Quantity-only syncs (from invoices / POS ledger recalcs) stay allowed.
CREATE OR REPLACE FUNCTION public.enforce_product_card_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- allow pure quantity/timestamp syncs
    IF (to_jsonb(NEW) - 'quantity' - 'updated_at')
       = (to_jsonb(OLD) - 'quantity' - 'updated_at') THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NOT public.accountant_perm('can_manage_products') THEN
    RAISE EXCEPTION 'لا تملك صلاحية تعديل بطاقة الصنف (الاطلاع فقط)';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_product_card_permission ON public.products;
CREATE TRIGGER trg_enforce_product_card_permission
BEFORE INSERT OR UPDATE OR DELETE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.enforce_product_card_permission();

-- 3) Manual stock adjustments: require can_manage_inventory + warehouse scope
CREATE OR REPLACE FUNCTION public.adjust_product_stock(_product_id uuid, _warehouse_id uuid, _delta numeric, _note text DEFAULT NULL::text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_cost  numeric;
BEGIN
  IF _delta IS NULL OR _delta = 0 THEN
    RETURN public.recalc_product_quantity(_product_id);
  END IF;

  IF NOT public.accountant_perm('can_manage_inventory') THEN
    RAISE EXCEPTION 'لا تملك صلاحية تعديل كميات المخزون';
  END IF;

  SELECT user_id, COALESCE(buy_price, 0) INTO v_owner, v_cost
    FROM public.products WHERE id = _product_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  IF v_owner <> public.get_team_owner_id() THEN
    RAISE EXCEPTION 'Not authorized for this product';
  END IF;
  IF _warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse is required for a stock adjustment';
  END IF;

  IF auth.uid() IS NOT NULL
     AND public.user_has_scope(auth.uid())
     AND NOT EXISTS (
       SELECT 1 FROM public.user_scope_access
        WHERE user_id = auth.uid() AND warehouse_id = _warehouse_id
     )
     AND EXISTS (
       SELECT 1 FROM public.user_scope_access
        WHERE user_id = auth.uid() AND warehouse_id IS NOT NULL
     )
  THEN
    RAISE EXCEPTION 'هذا المستودع خارج نطاق صلاحياتك';
  END IF;

  INSERT INTO public.stock_movements (
    user_id, product_id, warehouse_id, movement_type, quantity,
    reference_type, reference_note, unit_cost
  ) VALUES (
    v_owner, _product_id, _warehouse_id,
    (CASE WHEN _delta > 0 THEN 'وارد' ELSE 'صادر' END)::stock_movement_type,
    abs(_delta),
    'manual_adjustment',
    COALESCE(_note, 'تسوية كمية من بطاقة الصنف'),
    v_cost
  );

  RETURN public.recalc_product_quantity(_product_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_product_stock(_product_id uuid, _delta numeric, _warehouse_id uuid DEFAULT NULL::uuid, _note text DEFAULT NULL::text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.adjust_product_stock(_product_id, _warehouse_id, _delta, _note);
END;
$$;