-- إصلاح close_van_day: دعم نوعي القبض (إنجليزي + عربي) وإزالة is_deleted من invoices
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
  v_user_id UUID := auth.uid();
  v_day RECORD;
  v_total_sales NUMERIC := 0;
  v_total_collections NUMERIC := 0;
  v_total_invoices INTEGER := 0;
  v_expected_cash NUMERIC := 0;
  v_variance NUMERIC := 0;
BEGIN
  SELECT * INTO v_day FROM public.van_sales_days WHERE id = p_day_id AND user_id = v_user_id;
  IF v_day IS NULL THEN
    RAISE EXCEPTION 'Van day not found';
  END IF;
  IF v_day.status <> 'open' THEN
    RAISE EXCEPTION 'هذا اليوم غير مفتوح (الحالة: %)', v_day.status;
  END IF;

  -- المبيعات: فواتير المستودع منذ فتح اليوم (status != cancelled)
  SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
  INTO v_total_sales, v_total_invoices
  FROM public.invoices
  WHERE user_id = v_user_id
    AND warehouse_id = v_day.warehouse_id
    AND created_at >= v_day.opened_at
    AND created_at <= now()
    AND COALESCE(invoice_type, 'sale') IN ('sale','invoice')
    AND COALESCE(status, '') <> 'cancelled';

  -- التحصيلات: سندات قبض بكل المسميات (إنجليزي + عربي)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_collections
  FROM public.transactions
  WHERE user_id = v_user_id
    AND created_at >= v_day.opened_at
    AND created_at <= now()
    AND transaction_type IN ('receipt', 'سند قبض', 'sale_cash', 'pos_sale')
    AND COALESCE(is_deleted, false) = false;

  v_expected_cash := v_day.opening_cash + v_total_collections;
  v_variance := p_actual_cash - v_expected_cash;

  UPDATE public.van_sales_days SET
    status = 'closed',
    closed_at = now(),
    closed_by = v_user_id,
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