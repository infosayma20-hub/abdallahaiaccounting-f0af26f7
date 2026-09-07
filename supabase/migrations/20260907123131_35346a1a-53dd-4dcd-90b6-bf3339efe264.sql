ALTER TABLE public.voucher_lines
  ADD COLUMN IF NOT EXISTS salary_month integer,
  ADD COLUMN IF NOT EXISTS salary_year integer;

CREATE OR REPLACE FUNCTION public.sync_bulk_voucher_employee_movements(_voucher_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v RECORD; cat text;
BEGIN
  SELECT * INTO v FROM public.vouchers WHERE id=_voucher_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF COALESCE(v.subtype,'')<>'bulk' OR COALESCE(v.type,'')<>'payment' OR v.status<>'posted' THEN
    DELETE FROM public.employee_financial_movements
     WHERE source_type='finance_manual' AND source_id=_voucher_id;
    RETURN;
  END IF;

  cat := public._infer_bulk_emp_category(COALESCE(v.description,''));
  IF cat IS NULL THEN
    DELETE FROM public.employee_financial_movements
     WHERE source_type='finance_manual' AND source_id=_voucher_id;
    RETURN;
  END IF;

  -- سطور الموظفين: الربط الثابت عبر accounts.employee_id، واحتياطياً بالاسم الكامل
  CREATE TEMP TABLE _bulk_emp_lines ON COMMIT DROP AS
  SELECT vl.id AS line_id,
         COALESCE(a.employee_id, e2.id) AS employee_id,
         vl.debit AS amount,
         COALESCE(NULLIF(vl.description,''), v.description, 'سند صرف جماعي') AS line_desc,
         COALESCE(vl.salary_month, EXTRACT(MONTH FROM v.date)::int) AS s_month,
         COALESCE(vl.salary_year,  EXTRACT(YEAR  FROM v.date)::int) AS s_year,
         vl.salary_month IS NOT NULL AS pinned
  FROM public.voucher_lines vl
  LEFT JOIN public.accounts a
    ON a.user_id = v.user_id AND a.account_code = vl.account_code
   AND a.employee_id IS NOT NULL AND COALESCE(a.is_active,true)
  LEFT JOIN public.employees e2
    ON e2.user_id = v.user_id
   AND e2.full_name = regexp_replace(COALESCE(vl.account_name,''), '^ذمم موظف - ', '')
  WHERE vl.voucher_id = v.id
    AND vl.debit > 0
    AND COALESCE(vl.account_name,'') ILIKE 'ذمم موظف%';

  DELETE FROM _bulk_emp_lines WHERE employee_id IS NULL;

  -- تحديث الحركات الموجودة بشهر الخصم المثبّت على السطر
  UPDATE public.employee_financial_movements m
     SET salary_month = b.s_month,
         salary_year  = b.s_year,
         salary_month_locked = b.pinned
    FROM _bulk_emp_lines b
   WHERE m.source_id = v.id
     AND m.source_type = 'finance_manual'
     AND m.employee_id = b.employee_id
     AND m.amount = b.amount
     AND b.pinned
     AND (m.salary_month IS DISTINCT FROM b.s_month OR m.salary_year IS DISTINCT FROM b.s_year);

  -- إنشاء الحركات الناقصة فقط
  INSERT INTO public.employee_financial_movements (
    user_id, employee_id, source_type, source_id, source_reference,
    reference_number, category, description, amount, movement_type,
    status, movement_date, salary_month, salary_year, salary_month_locked,
    created_by, notes
  )
  SELECT v.user_id, b.employee_id, 'finance_manual', v.id, v.ref_number,
         v.ref_number, cat,
         b.line_desc || ' - ' || e.full_name,
         b.amount, 'debit', 'approved', v.date,
         b.s_month, b.s_year, b.pinned,
         COALESCE(v.posted_by, v.user_id), v.notes
  FROM _bulk_emp_lines b
  JOIN public.employees e ON e.id = b.employee_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.employee_financial_movements m
     WHERE m.source_id = v.id AND m.employee_id = b.employee_id AND m.amount = b.amount
  );

  DROP TABLE IF EXISTS _bulk_emp_lines;
END; $function$;