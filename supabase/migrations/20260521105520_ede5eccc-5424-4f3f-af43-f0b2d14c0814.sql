CREATE OR REPLACE FUNCTION public.open_van_day(
  p_sales_rep_id uuid,
  p_opening_cash numeric DEFAULT 0,
  p_opening_currency text DEFAULT 'ILS',
  p_notes text DEFAULT NULL,
  p_load_transfer_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_owner uuid;
  v_rep_auth uuid;
  v_warehouse_id uuid;
  v_day_id uuid;
  v_existing uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT user_id, auth_user_id, default_warehouse_id
    INTO v_owner, v_rep_auth, v_warehouse_id
  FROM public.sales_representatives
  WHERE id = p_sales_rep_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'البائع غير موجود';
  END IF;

  IF v_caller IS DISTINCT FROM v_owner AND v_caller IS DISTINCT FROM v_rep_auth THEN
    RAISE EXCEPTION 'غير مصرح لك بفتح يوم لهذا البائع';
  END IF;

  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'لم يتم تعيين مستودع افتراضي لهذا البائع';
  END IF;

  SELECT id INTO v_existing
  FROM public.van_sales_days
  WHERE sales_rep_id = p_sales_rep_id AND status = 'open'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'يوجد يوم عمل مفتوح بالفعل لهذا البائع (ID: %)', v_existing;
  END IF;

  INSERT INTO public.van_sales_days (
    user_id, sales_rep_id, warehouse_id,
    opening_cash, opening_currency, opening_notes,
    opened_by, load_transfer_id, status
  ) VALUES (
    v_owner, p_sales_rep_id, v_warehouse_id,
    p_opening_cash, p_opening_currency, p_notes,
    v_caller, p_load_transfer_id, 'open'
  ) RETURNING id INTO v_day_id;

  RETURN v_day_id;
END;
$function$;


CREATE OR REPLACE FUNCTION public.open_van_day_with_entry(
  p_sales_rep_id uuid,
  p_opening_cash numeric DEFAULT 0,
  p_opening_currency text DEFAULT 'ILS',
  p_source_cash_box_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_load_transfer_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_owner uuid;
  v_rep_auth uuid;
  v_day_id uuid;
  v_rep_cash_box_id uuid;
  v_rep_account_code text;
  v_src_account_code text;
  v_src_currency text;
  v_rep_name text;
  v_currency_ar text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT sr.user_id, sr.auth_user_id, sr.cash_box_id, sr.full_name
    INTO v_owner, v_rep_auth, v_rep_cash_box_id, v_rep_name
  FROM public.sales_representatives sr
  WHERE sr.id = p_sales_rep_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'البائع غير موجود';
  END IF;

  IF v_caller IS DISTINCT FROM v_owner AND v_caller IS DISTINCT FROM v_rep_auth THEN
    RAISE EXCEPTION 'غير مصرح لك بفتح يوم لهذا البائع';
  END IF;

  v_day_id := public.open_van_day(
    p_sales_rep_id,
    COALESCE(p_opening_cash, 0),
    COALESCE(p_opening_currency, 'ILS'),
    p_notes,
    p_load_transfer_id
  );

  IF COALESCE(p_opening_cash, 0) > 0 THEN
    IF p_source_cash_box_id IS NULL THEN
      RAISE EXCEPTION 'يجب اختيار الصندوق المصدر للعهدة';
    END IF;

    IF v_rep_cash_box_id IS NULL THEN
      RAISE EXCEPTION 'لم يتم ربط صندوق نقدي بالمندوب — يرجى التواصل مع المحاسب';
    END IF;

    SELECT gl_account_code INTO v_rep_account_code
    FROM public.cash_boxes
    WHERE id = v_rep_cash_box_id AND user_id = v_owner;

    IF v_rep_account_code IS NULL THEN
      RAISE EXCEPTION 'صندوق المندوب غير مربوط بحساب محاسبي (gl_account_code)';
    END IF;

    SELECT gl_account_code, currency
      INTO v_src_account_code, v_src_currency
    FROM public.cash_boxes
    WHERE id = p_source_cash_box_id AND user_id = v_owner;

    IF v_src_account_code IS NULL THEN
      RAISE EXCEPTION 'الصندوق المصدر غير موجود أو غير مربوط بحساب محاسبي';
    END IF;

    IF v_src_currency IS DISTINCT FROM COALESCE(p_opening_currency, 'ILS') THEN
      RAISE EXCEPTION 'عملة الصندوق المصدر (%) لا تطابق عملة العهدة (%)', v_src_currency, p_opening_currency;
    END IF;

    v_currency_ar := CASE COALESCE(p_opening_currency, 'ILS')
      WHEN 'ILS' THEN 'شيكل'
      WHEN 'USD' THEN 'دولار'
      WHEN 'JOD' THEN 'دينار'
      WHEN 'EUR' THEN 'يورو'
      ELSE 'شيكل'
    END;

    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type,
      reference, sales_rep_id, idempotency_key, notes
    ) VALUES (
      v_owner, CURRENT_DATE,
      'عهدة افتتاحية - فتح يوم المندوب ' || COALESCE(v_rep_name, ''),
      v_rep_account_code, v_src_account_code,
      p_opening_cash, v_currency_ar, 'تحويل نقدي',
      'VAN-OPEN-' || v_day_id::text,
      p_sales_rep_id,
      'van-open-' || v_day_id::text,
      COALESCE(p_notes, 'عهدة فتح يوم البائع المتجول')
    );
  END IF;

  RETURN v_day_id;
END;
$function$;