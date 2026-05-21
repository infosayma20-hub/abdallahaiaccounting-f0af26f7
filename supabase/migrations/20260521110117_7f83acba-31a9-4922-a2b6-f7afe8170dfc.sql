-- ============================================================
-- Unified effective-owner resolver for SECURITY DEFINER RPCs
-- Handles: main owners, invited team members, sales reps, employees
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_effective_owner_id(_auth_uid uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    -- 1) Sales rep portal account → owner of the rep record
    (SELECT sr.user_id
       FROM public.sales_representatives sr
      WHERE sr.auth_user_id = _auth_uid
      LIMIT 1),
    -- 2) Employee portal account → owner of the employee record
    (SELECT e.user_id
       FROM public.employees e
      WHERE e.auth_user_id = _auth_uid
      LIMIT 1),
    -- 3) Invited team member → inviter
    (SELECT p.invited_by
       FROM public.profiles p
      WHERE p.user_id = _auth_uid AND p.invited_by IS NOT NULL
      LIMIT 1),
    -- 4) Main owner → self
    _auth_uid
  );
$$;

COMMENT ON FUNCTION public.resolve_effective_owner_id(uuid) IS
'Returns the tenant data-owner id for any authenticated caller. Use inside SECURITY DEFINER RPCs that write tenant data, so portal users (sales reps / employees) and team members resolve to the same dataset as the owner.';


-- ============================================================
-- close_van_day: accept caller as owner OR as the rep (auth_user_id)
-- ============================================================
CREATE OR REPLACE FUNCTION public.close_van_day(
  p_day_id uuid,
  p_actual_cash numeric DEFAULT 0,
  p_closing_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_owner uuid;
  v_rep_auth uuid;
  v_day RECORD;
  v_total_sales NUMERIC := 0;
  v_total_collections NUMERIC := 0;
  v_total_invoices INTEGER := 0;
  v_expected_cash NUMERIC := 0;
  v_variance NUMERIC := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_day FROM public.van_sales_days WHERE id = p_day_id;
  IF v_day IS NULL THEN
    RAISE EXCEPTION 'Van day not found';
  END IF;

  SELECT sr.user_id, sr.auth_user_id
    INTO v_owner, v_rep_auth
  FROM public.sales_representatives sr
  WHERE sr.id = v_day.sales_rep_id;

  IF v_caller IS DISTINCT FROM v_owner AND v_caller IS DISTINCT FROM v_rep_auth THEN
    RAISE EXCEPTION 'غير مصرح لك بإغلاق يوم هذا المندوب';
  END IF;

  IF v_day.status <> 'open' THEN
    RAISE EXCEPTION 'هذا اليوم غير مفتوح (الحالة: %)', v_day.status;
  END IF;

  SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
  INTO v_total_sales, v_total_invoices
  FROM public.invoices
  WHERE user_id = v_owner
    AND warehouse_id = v_day.warehouse_id
    AND created_at >= v_day.opened_at
    AND created_at <= now()
    AND COALESCE(invoice_type, 'sale') IN ('sale','invoice')
    AND COALESCE(status, '') <> 'cancelled';

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_collections
  FROM public.transactions
  WHERE user_id = v_owner
    AND created_at >= v_day.opened_at
    AND created_at <= now()
    AND transaction_type IN ('receipt', 'سند قبض', 'sale_cash', 'pos_sale')
    AND COALESCE(is_deleted, false) = false;

  v_expected_cash := v_day.opening_cash + v_total_collections;
  v_variance := p_actual_cash - v_expected_cash;

  UPDATE public.van_sales_days SET
    status = 'closed',
    closed_at = now(),
    closed_by = v_caller,
    actual_cash_collected = p_actual_cash,
    expected_cash = v_expected_cash,
    cash_variance = v_variance,
    total_sales = v_total_sales,
    total_collections = v_total_collections,
    total_invoices = v_total_invoices,
    closing_notes = p_closing_notes
  WHERE id = p_day_id;

  RETURN jsonb_build_object(
    'day_id', p_day_id,
    'total_sales', v_total_sales,
    'total_collections', v_total_collections,
    'total_invoices', v_total_invoices,
    'expected_cash', v_expected_cash,
    'actual_cash', p_actual_cash,
    'variance', v_variance
  );
END;
$function$;